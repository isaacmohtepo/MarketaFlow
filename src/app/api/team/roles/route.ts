import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  hasPermission,
  ALL_PERMISSIONS,
  slugifyRoleName,
  isSystemRole,
} from "@/lib/permissions";
import { audit } from "@/lib/audit";

async function getMyAgency(userId: string) {
  return prisma.membership.findFirst({
    where: { userId, brandId: null },
    select: { agencyId: true },
  });
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const me = await getMyAgency(user.id);
  if (!me) return NextResponse.json({ roles: [] });

  const roles = await prisma.role.findMany({
    where: { agencyId: me.agencyId },
    orderBy: { createdAt: "asc" },
  });

  // Conteo de miembros por rol custom para mostrar "en uso por X personas"
  const slugs = roles.map((r) => r.slug);
  const counts =
    slugs.length > 0
      ? await prisma.membership.groupBy({
          by: ["role"],
          where: { agencyId: me.agencyId, role: { in: slugs }, brandId: null },
          _count: true,
        })
      : [];
  const countBySlug = new Map(counts.map((c) => [c.role, c._count]));

  return NextResponse.json({
    roles: roles.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      description: r.description,
      permissions: r.permissions,
      memberCount: countBySlug.get(r.slug) ?? 0,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}

const createSchema = z.object({
  name: z.string().min(2).max(40),
  description: z.string().max(200).optional().nullable(),
  permissions: z.array(z.string()).min(1),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const me = await getMyAgency(user.id);
  if (!me) return NextResponse.json({ error: "Sin agencia" }, { status: 403 });

  if (!(await hasPermission(user.id, me.agencyId, "roles.manage"))) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  let body;
  try {
    body = createSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  // Permisos válidos
  const invalid = body.permissions.filter((p) => !ALL_PERMISSIONS.includes(p));
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: `Permisos inválidos: ${invalid.join(", ")}` },
      { status: 400 },
    );
  }

  const slug = slugifyRoleName(body.name);
  if (!slug) {
    return NextResponse.json({ error: "Nombre inválido" }, { status: 400 });
  }
  // No permitir slugs que choquen con system roles
  if (isSystemRole(slug)) {
    return NextResponse.json(
      { error: "Ese nombre choca con un rol del sistema. Probá otro." },
      { status: 409 },
    );
  }
  // Único por agency
  const exists = await prisma.role.findUnique({
    where: { agencyId_slug: { agencyId: me.agencyId, slug } },
  });
  if (exists) {
    return NextResponse.json(
      { error: "Ya existe un rol con ese nombre" },
      { status: 409 },
    );
  }

  const role = await prisma.role.create({
    data: {
      agencyId: me.agencyId,
      name: body.name.trim(),
      slug,
      description: body.description?.trim() || null,
      permissions: body.permissions,
    },
  });

  audit({
    category: "team",
    action: "role.created",
    actorUserId: user.id,
    actorEmail: user.email,
    targetId: role.id,
    metadata: {
      agencyId: me.agencyId,
      slug,
      permissionsCount: body.permissions.length,
    },
    req,
  });

  return NextResponse.json({ role });
}
