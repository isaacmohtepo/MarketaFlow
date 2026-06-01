import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getBrandAccess, hasPermission } from "@/lib/permissions";
import { assignPostNumber } from "@/lib/slugs";

// Misma policy que posts/route.ts: solo http(s) o /uploads/ local.
// Bloquea javascript:/data: que renderizados como <img src> o <a href> = XSS.
const isSafeImagePath = (u: string) =>
  /^https?:\/\//i.test(u) || u.startsWith("/uploads/");

const schema = z.object({
  brandId: z.string().max(64),
  imageUrls: z
    .array(z.string().min(1).max(2048).refine(isSafeImagePath, "URL no permitida"))
    .min(1)
    .max(50),
  platform: z.string().max(40).optional(),
  postType: z.string().max(40).optional(),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const access = await getBrandAccess(user.id, body.brandId);
  if (!access) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  const ok = await hasPermission(user.id, access.agencyId, "posts.create", body.brandId);
  if (!ok) {
    return NextResponse.json({ error: "Sin permiso: posts.create" }, { status: 403 });
  }

  // Posición arranca después del último post de la marca
  const last = await prisma.post.findFirst({
    where: { brandId: body.brandId, deletedAt: null },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const startPosition = (last?.position ?? -1) + 1;

  const platform = body.platform ?? "instagram";
  const postType = body.postType ?? "feed";

  // Crear todos los posts en una transacción
  const created = await prisma.$transaction(
    body.imageUrls.map((url, i) =>
      prisma.post.create({
        data: {
          brandId: body.brandId,
          authorId: user.id,
          caption: "",
          imageUrl: url,
          platform,
          postType,
          status: "draft",
          position: startPosition + i,
          images: {
            create: [{ url, position: 0 }],
          },
        },
        select: { id: true },
      }),
    ),
  );

  // Números legibles secuenciales por marca (best-effort).
  for (const p of created) {
    await assignPostNumber(p.id, body.brandId);
  }

  return NextResponse.json({ ok: true, count: created.length, ids: created.map((p) => p.id) });
}
