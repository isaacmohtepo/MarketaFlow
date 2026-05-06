import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { uploadFile } from "@/lib/storage";
import { hashPassword } from "@/lib/auth";
import { recordActivity } from "@/lib/activity";
import { notifyBrandAgency } from "@/lib/notifications";
import { getEffectiveLimits } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// CORS abierto: el widget se carga desde dominios ajenos.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

const schema = z.object({
  token: z.string().min(8),
  body: z.string().min(1).max(2000),
  reporterName: z.string().min(1).max(80),
  reporterEmail: z.string().email().optional().nullable(),
  pageUrl: z.string().url(),
  pageTitle: z.string().max(200).optional().nullable(),
  selector: z.string().max(500).optional().nullable(),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  viewportW: z.number().int().positive().max(8192),
  viewportH: z.number().int().positive().max(8192),
  scrollY: z.number().int().min(0).optional().nullable(),
  // PNG en base64 sin el "data:image/png;base64," prefix
  screenshotBase64: z.string().min(100),
});

function jsonCors(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: CORS_HEADERS });
}

export async function POST(req: Request) {
  let body;
  try {
    body = schema.parse(await req.json());
  } catch (err) {
    return jsonCors({ error: "Datos inválidos", detail: String(err) }, 400);
  }

  const brand = await prisma.brand.findUnique({
    where: { widgetToken: body.token },
    include: { agency: true },
  });
  if (!brand) {
    return jsonCors({ error: "Token inválido" }, 401);
  }

  // Plan limits enforcement: el widget tiene límite de comments/mes en Free.
  // Contamos comments via widget en el mes actual (los que tienen pageUrl).
  const limits = await getEffectiveLimits(brand.agencyId);
  if (!limits.webFeedbackEnabled) {
    return jsonCors(
      { error: "El web feedback no está disponible en el plan actual de esta agencia." },
      402,
    );
  }
  if (limits.maxWebFeedbackComments !== -1) {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const count = await prisma.comment.count({
      where: {
        post: { brandId: brand.id },
        pageUrl: { not: null },
        createdAt: { gte: monthStart },
      },
    });
    if (count >= limits.maxWebFeedbackComments) {
      return jsonCors(
        {
          error: `Esta marca alcanzó el límite de ${limits.maxWebFeedbackComments} comentarios web del mes en su plan actual.`,
        },
        402,
      );
    }
  }

  // 1) Subir screenshot a R2
  let screenshotUrl: string;
  try {
    const cleaned = body.screenshotBase64.replace(/^data:image\/\w+;base64,/, "");
    const buf = Buffer.from(cleaned, "base64");
    const file = new File([new Uint8Array(buf)], `widget-${Date.now()}.png`, { type: "image/png" });
    const up = await uploadFile(file, { prefix: "widget" });
    screenshotUrl = up.url;
  } catch (err) {
    console.error("widget screenshot upload failed", err);
    return jsonCors({ error: "No se pudo procesar la captura" }, 500);
  }

  // 2) Resolver "reporter" como User (guest user reusable por nombre+email+brand)
  const reporterEmail =
    body.reporterEmail ??
    `widget_${brand.id}_${body.reporterName.toLowerCase().replace(/\s+/g, "_")}@guest.local`;
  let reporter = await prisma.user.findUnique({ where: { email: reporterEmail } });
  if (!reporter) {
    const passwordHash = await hashPassword(randomBytes(16).toString("hex"));
    reporter = await prisma.user.create({
      data: {
        email: reporterEmail,
        name: body.reporterName,
        passwordHash,
        role: "client",
        emailNotifications: false,
        memberships: {
          create: {
            agencyId: brand.agencyId,
            brandId: brand.id,
            role: "client",
          },
        },
      },
    });
  } else if (reporter.name !== body.reporterName) {
    await prisma.user.update({
      where: { id: reporter.id },
      data: { name: body.reporterName },
    });
  }

  // 3) Crear el Post (web_design) con la screenshot como cover y la URL como sourceUrl
  const last = await prisma.post.findFirst({
    where: { brandId: brand.id, deletedAt: null },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const position = (last?.position ?? -1) + 1;

  const titleSnippet = body.body.slice(0, 60);
  const post = await prisma.post.create({
    data: {
      brandId: brand.id,
      authorId: reporter.id,
      title: body.pageTitle ?? titleSnippet,
      caption: body.body,
      imageUrl: screenshotUrl,
      platform: "web",
      postType: "feedback",
      assetType: "web_design",
      sourceUrl: body.pageUrl,
      status: "in_review",
      position,
      images: {
        create: [
          {
            url: screenshotUrl,
            position: 0,
            mime: "image/png",
            name: `feedback-${new Date().toISOString().slice(0, 10)}.png`,
          },
        ],
      },
    },
  });

  // 4) Comentario inicial con el pin pixel-perfect sobre la screenshot
  await prisma.comment.create({
    data: {
      postId: post.id,
      userId: reporter.id,
      body: body.body,
      x: body.x,
      y: body.y,
      pageUrl: body.pageUrl,
      selector: body.selector ?? null,
      viewportW: body.viewportW,
      viewportH: body.viewportH,
      scrollY: body.scrollY ?? null,
    },
  });

  // 5) Activity + notificar a la agencia
  recordActivity({
    postId: post.id,
    userId: reporter.id,
    type: "created",
    meta: { source: "widget", pageUrl: body.pageUrl },
  }).catch(() => {});

  notifyBrandAgency({
    brandId: brand.id,
    postId: post.id,
    type: "post_in_review",
    body: `Nuevo feedback de ${body.reporterName} en ${body.pageUrl}`,
    actorName: body.reporterName,
  }).catch(() => {});

  return jsonCors({ ok: true, postId: post.id });
}
