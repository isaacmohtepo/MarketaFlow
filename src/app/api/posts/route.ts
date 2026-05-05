import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getBrandAccess } from "@/lib/permissions";
import { notifyBrandClients } from "@/lib/notifications";
import { recordActivity } from "@/lib/activity";
import { ASSET_TYPES } from "@/lib/asset-types";

const fileMetaSchema = z.object({
  url: z.string().min(1),
  mime: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
});

const schema = z.object({
  brandId: z.string(),
  caption: z.string().optional().nullable(),
  imageUrl: z.string().nullable().optional(),
  // Acepta tanto la forma vieja (string[]) como la nueva con metadata
  images: z.union([z.array(z.string()), z.array(fileMetaSchema)]).optional(),
  platform: z.string().default("instagram"),
  postType: z.string().default("feed"),
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

  const access = await getBrandAccess(user.id, body.brandId);
  if (!access || !access.canEdit) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

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

  const post = await prisma.post.create({
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
