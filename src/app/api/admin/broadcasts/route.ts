import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { audit } from "@/lib/audit";
import { resolveAudience } from "@/lib/broadcast";

/**
 * GET /api/admin/broadcasts → list
 * POST /api/admin/broadcasts → create draft
 *   { subject, bodyHtml, audience }
 *
 * GET /api/admin/broadcasts?previewAudience=trial_ending → cuenta cuántos
 *   destinatarios hay sin guardar nada.
 */

const createSchema = z.object({
  subject: z.string().min(1).max(150),
  bodyHtml: z.string().min(1).max(50_000),
  audience: z.enum(["all", "agencies", "clients", "trial_ending", "past_due"]),
});

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!(await isAdmin(me.id))) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const url = new URL(req.url);
  const previewAudience = url.searchParams.get("previewAudience");
  if (previewAudience) {
    const list = await resolveAudience(previewAudience);
    return NextResponse.json({ count: list.length });
  }

  const items = await prisma.emailBroadcast.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!(await isAdmin(me.id))) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  let body;
  try {
    body = createSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const created = await prisma.emailBroadcast.create({
    data: {
      subject: body.subject,
      bodyHtml: body.bodyHtml,
      audience: body.audience,
      createdById: me.id,
      status: "draft",
    },
  });

  audit({
    category: "admin",
    action: "broadcast.created",
    actorUserId: me.id,
    actorEmail: me.email,
    targetId: created.id,
    metadata: { subject: body.subject, audience: body.audience },
    req,
  });

  return NextResponse.json({ broadcast: created });
}
