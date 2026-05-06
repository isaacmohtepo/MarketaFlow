import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getBrandAccess, hasPermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";

/**
 * GET /api/brands/[id]/instagram → estado actual (sin exponer el token)
 * POST /api/brands/[id]/instagram { igUserId, igAccessToken } → guardar
 * DELETE /api/brands/[id]/instagram → desconectar (limpia tokens)
 *
 * Verifica las credenciales contra Meta Graph API antes de guardar para
 * evitar tokens malos. Si la verificación pasa, también obtenemos el
 * username público para mostrar en UI.
 */

const META_BASE = "https://graph.facebook.com/v21.0";

const schema = z.object({
  igUserId: z.string().min(1).max(50),
  igAccessToken: z.string().min(20).max(500),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { id } = await params;
  const access = await getBrandAccess(me.id, id);
  if (!access) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  const ok = await hasPermission(me.id, access.agencyId, "instagram.manage", id);
  if (!ok) {
    return NextResponse.json({ error: "Sin permiso: instagram.manage" }, { status: 403 });
  }
  const brand = await prisma.brand.findUnique({
    where: { id },
    select: { igUserId: true, igAccessToken: true },
  });
  return NextResponse.json({
    connected: !!brand?.igUserId && !!brand?.igAccessToken,
    igUserId: brand?.igUserId ?? null,
    // Nunca devolvemos el token completo — solo si está seteado
    hasToken: !!brand?.igAccessToken,
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { id } = await params;
  const access = await getBrandAccess(me.id, id);
  if (!access) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  const ok = await hasPermission(me.id, access.agencyId, "instagram.manage", id);
  if (!ok) {
    return NextResponse.json({ error: "Sin permiso: instagram.manage" }, { status: 403 });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  // Verificar las credenciales contra Meta Graph API. Hacemos un GET al
  // perfil del business account: si es 200 → válido; sino devolvemos
  // el error de Meta legible.
  let username: string | null = null;
  try {
    const res = await fetch(
      `${META_BASE}/${encodeURIComponent(body.igUserId)}?fields=username,name&access_token=${encodeURIComponent(body.igAccessToken)}`,
    );
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      const msg =
        (j as { error?: { message?: string } })?.error?.message ??
        `Meta respondió ${res.status}`;
      return NextResponse.json(
        { error: `Credenciales inválidas: ${msg}` },
        { status: 400 },
      );
    }
    const data = (await res.json()) as { username?: string; name?: string };
    username = data.username ?? data.name ?? null;
  } catch (err) {
    return NextResponse.json(
      {
        error:
          "No se pudo contactar a Meta. Verificá tu conexión y los permisos del token.",
        detail: err instanceof Error ? err.message : null,
      },
      { status: 502 },
    );
  }

  await prisma.brand.update({
    where: { id },
    data: {
      igUserId: body.igUserId,
      igAccessToken: body.igAccessToken,
    },
  });

  audit({
    category: "team",
    action: "brand.instagram_connected",
    actorUserId: me.id,
    actorEmail: me.email,
    targetId: id,
    metadata: { igUserId: body.igUserId, username },
    req,
  });

  return NextResponse.json({ ok: true, username });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { id } = await params;
  const access = await getBrandAccess(me.id, id);
  if (!access) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  const ok = await hasPermission(me.id, access.agencyId, "instagram.manage", id);
  if (!ok) {
    return NextResponse.json({ error: "Sin permiso: instagram.manage" }, { status: 403 });
  }
  await prisma.brand.update({
    where: { id },
    data: { igUserId: null, igAccessToken: null },
  });
  audit({
    category: "team",
    action: "brand.instagram_disconnected",
    actorUserId: me.id,
    actorEmail: me.email,
    targetId: id,
    req,
  });
  return NextResponse.json({ ok: true });
}
