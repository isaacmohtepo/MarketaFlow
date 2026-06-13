import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getActiveAgencyId } from "@/lib/active-agency";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ count: 0 });

  // Scope al workspace activo: el badge del inbox cuenta solo los posts de la
  // agencia activa, no de todas las del user.
  const activeAgencyId = await getActiveAgencyId(user.id);

  // Scoping correcto: agency-level (brandId: null) ve toda la agencia, pero
  // un client brand-scoped solo debe ver SU brand. El filtro anterior contaba
  // posts de TODAS las brands de la agencia para cualquier miembro, lo que
  // filtraba el volumen de actividad de brands ajenas a un cliente.
  const accessFilter: Prisma.PostWhereInput = {
    deletedAt: null,
    brand: {
      // Solo marcas del workspace ACTIVO. (Sin agencia activa → centinela que
      // no matchea ninguna marca → inbox vacío.)
      agencyId: activeAgencyId ?? "__no_agency__",
      OR: [
        // Agency-level membership (owner/editor sin brandId) → ve toda la agencia
        { agency: { members: { some: { userId: user.id, brandId: null } } } },
        // Brand-scoped membership (client) → solo esa brand
        { memberships: { some: { userId: user.id } } },
      ],
    },
  };

  const now = new Date();

  const [pending, changes, ready] = await Promise.all([
    prisma.post.count({ where: { ...accessFilter, status: "in_review" } }),
    prisma.post.count({ where: { ...accessFilter, status: "changes_requested" } }),
    prisma.post.count({
      where: {
        ...accessFilter,
        status: { in: ["approved", "scheduled"] },
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }],
        publishedAt: null,
      },
    }),
  ]);

  return NextResponse.json({ count: pending + changes + ready });
}
