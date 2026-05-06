import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getPostAccess } from "@/lib/permissions";
import { fetchInstagramInsights } from "@/lib/publishers/instagram-insights";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

/**
 * GET /api/posts/[id]/insights
 *
 * Devuelve las métricas del post publicado en Instagram. Usa cache de 15 min
 * en `Post.insights` para evitar pegarle a Meta en cada page load.
 *
 * Solo funciona si:
 *  - Post está published (publishedAt seteado)
 *  - Post tiene igMediaId (se publicó via Meta API)
 *  - Brand tiene igAccessToken activo
 */
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 min

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const ctx = await getPostAccess(me.id, id);
  if (!ctx) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  // Rate limit para no spamear Meta API: 30/min/user/post
  const rl = rateLimit(req, {
    key: "post-insights",
    limit: 30,
    windowMs: 60_000,
    extra: `${me.id}:${id}`,
  });
  if (!rl.ok) return rateLimitResponse(rl);

  const post = await prisma.post.findUnique({
    where: { id },
    include: {
      brand: { select: { igAccessToken: true } },
    },
  });
  if (!post) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  if (!post.publishedAt) {
    return NextResponse.json({
      ok: true,
      insights: null,
      reason: "Post no publicado todavía",
    });
  }
  if (!post.igMediaId) {
    return NextResponse.json({
      ok: true,
      insights: null,
      reason: "Sin IG media ID — publicado en modo demo o plataforma distinta",
    });
  }
  if (!post.brand.igAccessToken) {
    return NextResponse.json({
      ok: true,
      insights: null,
      reason: "Brand no tiene Instagram conectado",
    });
  }

  // Cache freshness
  const url = new URL(req.url);
  const force = url.searchParams.get("refresh") === "1";
  const cacheAge =
    post.insightsRefreshedAt
      ? Date.now() - post.insightsRefreshedAt.getTime()
      : Infinity;
  const cacheValid = !force && cacheAge < CACHE_TTL_MS && post.insights;

  if (cacheValid) {
    return NextResponse.json({
      ok: true,
      insights: post.insights,
      cached: true,
      ageSeconds: Math.round(cacheAge / 1000),
    });
  }

  // Fetch fresh
  const insights = await fetchInstagramInsights(
    post.igMediaId,
    post.brand.igAccessToken,
  );

  if (!insights) {
    // Si la API falla, devolvemos el cache aunque esté viejo (mejor que nada)
    return NextResponse.json({
      ok: true,
      insights: post.insights ?? null,
      cached: !!post.insights,
      stale: true,
      reason: "Meta no devolvió métricas — token expirado o permisos faltantes",
    });
  }

  await prisma.post.update({
    where: { id },
    data: {
      insights,
      insightsRefreshedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true, insights, cached: false });
}
