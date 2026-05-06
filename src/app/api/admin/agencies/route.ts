import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import type { Prisma } from "@/generated/prisma";

/**
 * GET /api/admin/agencies
 *   ?q=&plan=&status=&suspended=&page=&pageSize=
 *
 * Lista agencias con sus datos clave para el admin: nombre, owner,
 * subscription (plan + status), brands count, members count, MRR.
 */
const PAGE_SIZE = 25;

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!(await isAdmin(me.id))) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const plan = url.searchParams.get("plan") ?? "all";
  const status = url.searchParams.get("status") ?? "all";
  const suspended = url.searchParams.get("suspended") ?? "all";
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);

  const where: Prisma.AgencyWhereInput = {};
  if (q) where.name = { contains: q, mode: "insensitive" };
  if (suspended === "yes") where.suspendedAt = { not: null };
  if (suspended === "no") where.suspendedAt = null;

  // Filtros sobre subscription
  if (plan !== "all" || status !== "all") {
    where.subscription = {};
    if (plan !== "all") where.subscription.plan = plan;
    if (status !== "all") where.subscription.status = status;
  }

  const [items, totalCount] = await Promise.all([
    prisma.agency.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        subscription: true,
        members: {
          where: { role: "owner", brandId: null },
          take: 1,
          include: {
            user: { select: { id: true, email: true, name: true } },
          },
        },
        _count: {
          select: { brands: true, members: true },
        },
      },
    }),
    prisma.agency.count({ where }),
  ]);

  return NextResponse.json({
    items: items.map((a) => ({
      id: a.id,
      name: a.name,
      createdAt: a.createdAt,
      suspendedAt: a.suspendedAt,
      suspendedReason: a.suspendedReason,
      owner: a.members[0]?.user ?? null,
      brandsCount: a._count.brands,
      membersCount: a._count.members,
      subscription: a.subscription
        ? {
            plan: a.subscription.plan,
            status: a.subscription.status,
            billingCycle: a.subscription.billingCycle,
            trialEndsAt: a.subscription.trialEndsAt,
            currentPeriodEnd: a.subscription.currentPeriodEnd,
            cancelAtPeriodEnd: a.subscription.cancelAtPeriodEnd,
            nextChargeAt: a.subscription.nextChargeAt,
          }
        : null,
    })),
    totalCount,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(totalCount / PAGE_SIZE)),
  });
}
