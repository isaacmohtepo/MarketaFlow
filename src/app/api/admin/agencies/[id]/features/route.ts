import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { audit } from "@/lib/audit";
import { getFlags, setFeature, KNOWN_FLAGS, type FeatureFlag } from "@/lib/features";

/**
 * GET /api/admin/agencies/[id]/features → lista flags resueltos
 * POST /api/admin/agencies/[id]/features { flag, value: boolean | null }
 *   value=null limpia el override y vuelve al default del plan.
 */
const schema = z.object({
  flag: z.enum(KNOWN_FLAGS),
  value: z.boolean().nullable(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!(await isAdmin(me.id))) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }
  const { id } = await params;
  const flags = await getFlags(id);
  return NextResponse.json({ flags });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!(await isAdmin(me.id))) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }
  const { id } = await params;
  let body;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  await setFeature(id, body.flag as FeatureFlag, body.value);
  audit({
    category: "admin",
    action: "agency.feature_flag_changed",
    actorUserId: me.id,
    actorEmail: me.email,
    targetId: id,
    metadata: { flag: body.flag, value: body.value },
    req,
  });
  return NextResponse.json({ ok: true });
}
