import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { notifyBrandAgency } from "@/lib/notifications";
import { rateLimit } from "@/lib/rate-limit";
import { widgetCors } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS(req: Request) {
  return new Response(null, {
    status: 204,
    headers: widgetCors(req.headers.get("origin")),
  });
}

function safeOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = "";
    u.search = "";
    return u.toString();
  } catch {
    return raw.slice(0, 500);
  }
}

export async function POST(req: Request) {
  const CORS = widgetCors(req.headers.get("origin"));
  // Heartbeat es chatty (cada carga de página del widget). Limitamos a 60/min
  // por IP — suficiente para uso legítimo, frena flood obvio.
  const rl = rateLimit(req, {
    key: "widget-heartbeat",
    limit: 60,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many heartbeats" },
      { status: 429, headers: CORS },
    );
  }

  let payload: {
    token?: string;
    pageUrl?: string;
    userAgent?: string;
  };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400, headers: CORS });
  }

  const token = (payload.token ?? "").trim();
  const rawUrl = (payload.pageUrl ?? "").trim();
  if (!token || !rawUrl) {
    return NextResponse.json({ error: "missing fields" }, { status: 400, headers: CORS });
  }

  const brand = await prisma.brand.findUnique({
    where: { widgetToken: token },
    select: { id: true, name: true },
  });
  if (!brand) {
    return NextResponse.json({ error: "invalid token" }, { status: 403, headers: CORS });
  }

  const url = normalizeUrl(rawUrl);
  const origin = safeOrigin(url);
  const ua = (payload.userAgent ?? req.headers.get("user-agent") ?? "").slice(0, 300);
  const now = new Date();

  // ¿Es el primer ping de la marca? Lo detectamos antes del upsert para mandar notif.
  const wasEmpty =
    (await prisma.widgetPing.count({ where: { brandId: brand.id } })) === 0;

  await prisma.widgetPing.upsert({
    where: { brandId_url: { brandId: brand.id, url } },
    create: {
      brandId: brand.id,
      url,
      origin,
      userAgent: ua || null,
      firstSeenAt: now,
      lastSeenAt: now,
      hitCount: 1,
    },
    update: {
      lastSeenAt: now,
      userAgent: ua || undefined,
      hitCount: { increment: 1 },
    },
  });

  // Si era el primer ping de la marca → onboarding success: avisamos a la agencia.
  if (wasEmpty) {
    notifyBrandAgency({
      brandId: brand.id,
      type: "widget_first_ping",
      body: `🎉 Widget detectado en ${origin || url}. El feedback en vivo ya está activo.`,
      actorName: brand.name,
    }).catch((err) => console.error("notif first ping failed", err));
  }

  return NextResponse.json({ ok: true }, { headers: CORS });
}
