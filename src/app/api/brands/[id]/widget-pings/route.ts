import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getBrandAccess } from "@/lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: brandId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const access = await getBrandAccess(user.id, brandId);
  if (!access || !access.canEdit) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const pings = await prisma.widgetPing.findMany({
    where: { brandId },
    orderBy: { lastSeenAt: "desc" },
    take: 200,
    select: {
      id: true,
      url: true,
      origin: true,
      lastSeenAt: true,
      firstSeenAt: true,
      hitCount: true,
    },
  });

  // Agrupamos por origen — mostramos la última URL vista y total de rutas distintas
  const byOrigin = new Map<
    string,
    {
      origin: string;
      latestUrl: string;
      latestId: string;
      lastSeenAt: Date;
      firstSeenAt: Date;
      pageCount: number;
      totalHits: number;
    }
  >();
  for (const p of pings) {
    const key = p.origin || p.url;
    const cur = byOrigin.get(key);
    if (!cur) {
      byOrigin.set(key, {
        origin: p.origin || p.url,
        latestUrl: p.url,
        latestId: p.id,
        lastSeenAt: p.lastSeenAt,
        firstSeenAt: p.firstSeenAt,
        pageCount: 1,
        totalHits: p.hitCount,
      });
    } else {
      cur.pageCount += 1;
      cur.totalHits += p.hitCount;
      if (p.firstSeenAt < cur.firstSeenAt) cur.firstSeenAt = p.firstSeenAt;
    }
  }
  const grouped = Array.from(byOrigin.values()).sort(
    (a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime(),
  );

  return NextResponse.json({ pings: grouped });
}
