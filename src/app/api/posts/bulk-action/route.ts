import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getBrandAccess, hasPermission } from "@/lib/permissions";
import { recordActivity } from "@/lib/activity";
import { invalidateBrandKpis } from "@/lib/kpis";

const STATUSES = [
  "draft",
  "in_review",
  "changes_requested",
  "approved",
  "scheduled",
  "published",
] as const;

const schema = z.object({
  postIds: z.array(z.string()).min(1).max(100),
  action: z.enum(["delete", "restore", "set_status", "set_schedule", "duplicate"]),
  status: z.enum(STATUSES).optional(),
  scheduledAt: z.string().nullable().optional(),
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

  // Cargar posts y validar que todos pertenezcan a marcas que el user puede editar
  const posts = await prisma.post.findMany({
    where: { id: { in: body.postIds } },
    select: { id: true, brandId: true, status: true, position: true },
  });
  if (posts.length === 0) {
    return NextResponse.json({ error: "No se encontraron posts" }, { status: 404 });
  }

  // El permiso requerido depende de la acción (y, en set_status, del estado
  // destino) — igual que las rutas de un solo post. Sin esto, un rol con solo
  // `posts.schedule` podría borrar/aprobar/publicar en masa saltándose el gate
  // más estricto de la ruta individual (escalada vertical de privilegios).
  const requiredPerm = ((): string => {
    if (body.action === "delete" || body.action === "restore") return "posts.delete";
    if (body.action === "duplicate") return "posts.create";
    if (body.action === "set_status") {
      if (body.status === "approved" || body.status === "changes_requested")
        return "posts.approve";
      if (body.status === "published") return "posts.publish";
      return "posts.schedule";
    }
    return "posts.schedule"; // set_schedule
  })();

  const brandIds = Array.from(new Set(posts.map((p) => p.brandId)));
  // Invalida cache de KPIs de cada marca afectada al final de la request
  const invalidate = () => brandIds.forEach((bid) => invalidateBrandKpis(bid));
  const accessChecks = await Promise.all(brandIds.map((bid) => getBrandAccess(user.id, bid)));
  for (let i = 0; i < accessChecks.length; i++) {
    const a = accessChecks[i];
    if (!a) {
      return NextResponse.json({ error: "Sin permiso en una de las marcas" }, { status: 403 });
    }
    const ok = await hasPermission(user.id, a.agencyId, requiredPerm, brandIds[i]);
    if (!ok) {
      return NextResponse.json({ error: `Sin permiso: ${requiredPerm}` }, { status: 403 });
    }
  }

  const ids = posts.map((p) => p.id);

  if (body.action === "delete") {
    await prisma.post.updateMany({
      where: { id: { in: ids } },
      data: { deletedAt: new Date() },
    });
    await Promise.all(
      ids.map((id) => recordActivity({ postId: id, userId: user.id, type: "deleted" })),
    );
    invalidate();
    return NextResponse.json({ ok: true, count: ids.length });
  }

  if (body.action === "restore") {
    await prisma.post.updateMany({
      where: { id: { in: ids } },
      data: { deletedAt: null },
    });
    await Promise.all(
      ids.map((id) => recordActivity({ postId: id, userId: user.id, type: "restored" })),
    );
    invalidate();
    return NextResponse.json({ ok: true, count: ids.length });
  }

  if (body.action === "set_status") {
    if (!body.status) {
      return NextResponse.json({ error: "status requerido" }, { status: 400 });
    }
    await prisma.post.updateMany({
      where: { id: { in: ids } },
      data: { status: body.status },
    });
    // Record activities (only for posts that actually changed status)
    await Promise.all(
      posts
        .filter((p) => p.status !== body.status)
        .map((p) =>
          recordActivity({
            postId: p.id,
            userId: user.id,
            type: "status_changed",
            meta: { from: p.status, to: body.status },
          }),
        ),
    );
    invalidate();
    return NextResponse.json({ ok: true, count: ids.length });
  }

  if (body.action === "set_schedule") {
    const scheduledAt =
      body.scheduledAt === undefined || body.scheduledAt === null
        ? null
        : new Date(body.scheduledAt);
    await prisma.post.updateMany({
      where: { id: { in: ids } },
      data: { scheduledAt },
    });
    invalidate();
    return NextResponse.json({ ok: true, count: ids.length });
  }

  if (body.action === "duplicate") {
    // Duplicar cada post (sin imágenes adicionales más allá de la principal)
    const fullPosts = await prisma.post.findMany({
      where: { id: { in: ids } },
      include: { images: true },
    });
    const created = await prisma.$transaction(
      fullPosts.map((p) =>
        prisma.post.create({
          data: {
            brandId: p.brandId,
            authorId: user.id,
            caption: p.caption,
            imageUrl: p.imageUrl,
            platform: p.platform,
            postType: p.postType,
            status: "draft",
            position: p.position + 1,
            images: {
              create: p.images.map((img) => ({ url: img.url, position: img.position })),
            },
          },
          select: { id: true },
        }),
      ),
    );
    await Promise.all(
      created.map((c) => recordActivity({ postId: c.id, userId: user.id, type: "created" })),
    );
    invalidate();
    return NextResponse.json({ ok: true, count: created.length, ids: created.map((c) => c.id) });
  }

  return NextResponse.json({ error: "Acción desconocida" }, { status: 400 });
}
