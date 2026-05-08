import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getBrandAccess } from "@/lib/permissions";

/**
 * GET /api/brands/[id]/recent-media?limit=24
 *
 * Lista los últimos archivos (imágenes / videos) subidos a posts de
 * la brand. Usado por NewPostForm para mostrar un picker de "media
 * reciente" así el user puede reusar archivos sin re-subirlos.
 *
 * Dedupea por URL — si el mismo archivo aparece en múltiples posts,
 * lo mostramos una vez con su uso más reciente.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: brandId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const access = await getBrandAccess(user.id, brandId);
  if (!access) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });

  const url = new URL(req.url);
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") ?? "24", 10) || 24, 1),
    60,
  );

  // Traemos hasta 4x el limit para tener margen de dedupe (mismo URL en
  // múltiples posts).
  const rows = await prisma.postImage.findMany({
    where: {
      post: { brandId, deletedAt: null },
    },
    orderBy: { createdAt: "desc" },
    take: limit * 4,
    select: {
      id: true,
      url: true,
      mime: true,
      name: true,
      createdAt: true,
      postId: true,
    },
  });

  // Dedupear por URL (mismo archivo subido al mismo post repetido como
  // imagen + video, etc.) y limitar al cap.
  const seen = new Set<string>();
  const unique: typeof rows = [];
  for (const r of rows) {
    if (seen.has(r.url)) continue;
    seen.add(r.url);
    unique.push(r);
    if (unique.length >= limit) break;
  }

  return NextResponse.json({
    items: unique.map((r) => ({
      url: r.url,
      mime: r.mime,
      name: r.name,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}
