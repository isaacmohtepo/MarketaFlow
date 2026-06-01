import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { audit } from "@/lib/audit";
import { generateBrandSlug, generateAgencySlug } from "@/lib/slugs";

/**
 * POST /api/admin/backfill-slugs
 *
 * Backfill one-shot e IDEMPOTENTE de las URLs legibles:
 *   - Brand.slug  (a partir del nombre, único global con sufijo -2/-3)
 *   - Agency.slug (idem)
 *   - Post.number (secuencial POR marca, ordenado por createdAt)
 *
 * Solo toca filas que todavía NO tienen el valor (slug/number null), así que
 * se puede correr varias veces sin efectos. Solo admins.
 *
 * Correr UNA vez después de `prisma db push` que agrega las columnas.
 */
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!(await isAdmin(me.id))) {
    return NextResponse.json({ error: "Sin permisos de admin" }, { status: 403 });
  }

  // 1. Brands sin slug
  const brandsNoSlug = await prisma.brand.findMany({
    where: { slug: null },
    select: { id: true, name: true },
  });
  let brandSlugs = 0;
  for (const b of brandsNoSlug) {
    const slug = await generateBrandSlug(b.name, b.id);
    await prisma.brand.update({ where: { id: b.id }, data: { slug } });
    brandSlugs++;
  }

  // 2. Agencies sin slug
  const agenciesNoSlug = await prisma.agency.findMany({
    where: { slug: null },
    select: { id: true, name: true },
  });
  let agencySlugs = 0;
  for (const a of agenciesNoSlug) {
    const slug = await generateAgencySlug(a.name, a.id);
    await prisma.agency.update({ where: { id: a.id }, data: { slug } });
    agencySlugs++;
  }

  // 3. Post.number secuencial por marca (continúa desde el max existente).
  const brandIds = (
    await prisma.brand.findMany({ select: { id: true } })
  ).map((b) => b.id);
  let postsNumbered = 0;
  for (const brandId of brandIds) {
    const maxRow = await prisma.post.aggregate({
      where: { brandId, number: { not: null } },
      _max: { number: true },
    });
    let next = (maxRow._max.number ?? 0) + 1;
    const posts = await prisma.post.findMany({
      where: { brandId, number: null },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    for (const p of posts) {
      await prisma.post.update({ where: { id: p.id }, data: { number: next++ } });
      postsNumbered++;
    }
  }

  audit({
    category: "admin",
    action: "backfill.slugs",
    actorUserId: me.id,
    actorEmail: me.email,
    metadata: { brandSlugs, agencySlugs, postsNumbered },
    req,
  });

  return NextResponse.json({
    ok: true,
    brandSlugs,
    agencySlugs,
    postsNumbered,
  });
}
