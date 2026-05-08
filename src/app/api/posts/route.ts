import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { notifyBrandClients } from "@/lib/notifications";
import { recordActivity } from "@/lib/activity";
import { assertBrandNotSuspended } from "@/lib/suspension";
import { assertBrandUnlocked } from "@/lib/brand-lock";
import { ASSET_TYPES } from "@/lib/asset-types";
import { canCreatePost } from "@/lib/billing";

/**
 * URLs de imágenes deben ser http(s) (R2 público o externas) o paths
 * locales /uploads/. Bloqueamos javascript:/data:/file: para prevenir
 * XSS si en algún componente se renderiza con dangerouslySetInnerHTML
 * o si el browser ejecuta scripts en src de tipos no estándar.
 */
const isSafeImagePath = (u: string) =>
  /^https?:\/\//i.test(u) || u.startsWith("/uploads/");

const fileMetaSchema = z.object({
  url: z.string().min(1).refine(isSafeImagePath, "URL no permitida"),
  mime: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
});

const schema = z.object({
  brandId: z.string().max(64),
  caption: z.string().max(10_000).optional().nullable(),
  imageUrl: z
    .string()
    .max(2048)
    .refine(isSafeImagePath, "URL no permitida")
    .nullable()
    .optional(),
  // Acepta tanto la forma vieja (string[]) como la nueva con metadata
  images: z
    .union([
      z.array(z.string().max(2048).refine(isSafeImagePath, "URL no permitida")).max(20),
      z.array(fileMetaSchema).max(20),
    ])
    .optional(),
  platform: z.string().max(40).default("instagram"),
  postType: z.string().max(40).default("feed"),
  assetType: z.enum(ASSET_TYPES).default("social_post"),
  sourceUrl: z
    .string()
    .url()
    .refine((u) => /^https?:\/\//i.test(u), "URL debe empezar con http:// o https://")
    .nullable()
    .optional(),
  scheduledAt: z.string().nullable().optional(),
  status: z.enum(["draft", "in_review"]).default("draft"),
});

type FileMeta = { url: string; mime?: string | null; name?: string | null };

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  // posts.create gateway: cualquier rol con este permiso (CM, Designer NO,
  // Manager, Owner). Designer entra por upload_media en PATCH, no acá.
  const brandForGate = await prisma.brand.findUnique({
    where: { id: body.brandId },
    select: { agencyId: true },
  });
  if (!brandForGate) {
    return NextResponse.json({ error: "Brand no encontrado" }, { status: 404 });
  }
  const canCreate = await hasPermission(
    user.id,
    brandForGate.agencyId,
    "posts.create",
    body.brandId,
  );
  if (!canCreate) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  // Suspension guard: si la agency está suspended, bloqueamos creates.
  const suspendGuard = await assertBrandNotSuspended(body.brandId);
  if (!suspendGuard.ok) return suspendGuard.response;

  // Brand-lock guard: si la marca está pausada por exceder el plan,
  // bloqueamos creates. El owner debe upgradear o reactivarla.
  const lockGuard = await assertBrandUnlocked(body.brandId);
  if (!lockGuard.ok) return lockGuard.response;

  // Plan limits enforcement: chequea posts/mes. Lo hacemos ANTES del transaction
  // (lectura sola, no race-sensitive en este punto). El check final + create
  // van en una Serializable transaction abajo para cerrar TOCTOU.
  const brandRow = brandForGate;

  // Gate: web_design solo se permite si la URL del sitio coincide con un origen
  // donde detectamos el widget pingeando. Si está en draft (no envío a review)
  // permitimos guardar sin validar.
  if (body.assetType === "web_design" && body.status === "in_review") {
    if (!body.sourceUrl) {
      return NextResponse.json(
        { error: "La URL del sitio es obligatoria para enviar a revisión." },
        { status: 400 },
      );
    }
    let urlOrigin = "";
    try {
      urlOrigin = new URL(body.sourceUrl).origin.toLowerCase();
    } catch {
      return NextResponse.json({ error: "URL inválida." }, { status: 400 });
    }
    const matching = await prisma.widgetPing.findFirst({
      where: { brandId: body.brandId, origin: { equals: urlOrigin, mode: "insensitive" } },
      select: { id: true },
    });
    if (!matching) {
      return NextResponse.json(
        {
          error:
            "El widget no se detectó en este dominio. Pegá el script del widget en el sitio, abrí una página, y volvé a comprobar antes de enviar a revisión.",
        },
        { status: 400 },
      );
    }
  }

  // Normaliza a FileMeta[]: acepta string[] (legacy) o FileMeta[] (nuevo)
  const imgsRaw: (string | FileMeta)[] =
    body.images && body.images.length > 0
      ? body.images
      : body.imageUrl
        ? [body.imageUrl]
        : [];
  const files: FileMeta[] = imgsRaw
    .filter(Boolean)
    .map((x) => (typeof x === "string" ? { url: x } : x));

  // Cover: primer archivo que sea imagen (o si no hay imagen, primer archivo)
  const firstImage = files.find((f) => (f.mime ?? "image/").startsWith("image/"));
  const cover = firstImage?.url ?? files[0]?.url ?? null;

  // Serializable transaction: re-check del límite + create atómico para cerrar
  // race condition. Si dos requests pasan simultaneo el primer check de arriba,
  // Postgres detecta el conflicto en Serializable y aborta una con error.
  const txResult = await prisma.$transaction(
    async (tx) => {
      if (brandRow) {
        const check = await canCreatePost(brandRow.agencyId, tx);
        if (!check.ok) return { ok: false as const, check };
      }
      const created = await tx.post.create({
        data: {
          brandId: body.brandId,
          authorId: user.id,
          caption: body.caption ?? "",
          imageUrl: cover,
          platform: body.platform,
          postType: body.postType,
          assetType: body.assetType,
          sourceUrl: body.sourceUrl ?? null,
          scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
          status: body.status,
          images: {
            create: files.map((f, i) => ({
              url: f.url,
              position: i,
              mime: f.mime ?? null,
              name: f.name ?? null,
            })),
          },
        },
      });
      return { ok: true as const, post: created };
    },
    { isolationLevel: "Serializable" },
  );

  if (!txResult.ok) {
    return NextResponse.json(
      {
        error: txResult.check.reason,
        currentCount: txResult.check.currentCount,
        limit: txResult.check.limit,
        suggestedPlan: txResult.check.suggestedPlan,
      },
      { status: 402 },
    );
  }
  const post = txResult.post;
  await recordActivity({
    postId: post.id,
    userId: user.id,
    type: "created",
    meta: { status: post.status },
  });

  if (post.status === "in_review") {
    await notifyBrandClients({
      brandId: post.brandId,
      postId: post.id,
      type: "post_in_review",
      body: "Hay un nuevo post para revisar",
      actorName: user.name ?? user.email,
    });
  }

  return NextResponse.json({ id: post.id });
}
