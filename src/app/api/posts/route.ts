import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getBrandAccess } from "@/lib/permissions";
import { notifyBrandClients } from "@/lib/notifications";
import { recordActivity } from "@/lib/activity";

const schema = z.object({
  brandId: z.string(),
  caption: z.string().optional().nullable(),
  imageUrl: z.string().nullable().optional(),
  images: z.array(z.string()).optional(),
  platform: z.string().default("instagram"),
  postType: z.string().default("feed"),
  scheduledAt: z.string().nullable().optional(),
  status: z.enum(["draft", "in_review"]).default("draft"),
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
  if (!access || !access.canEdit) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const imgs = (body.images && body.images.length > 0
    ? body.images
    : body.imageUrl
      ? [body.imageUrl]
      : []
  ).filter(Boolean);

  const post = await prisma.post.create({
    data: {
      brandId: body.brandId,
      authorId: user.id,
      caption: body.caption ?? "",
      imageUrl: imgs[0] ?? null,
      platform: body.platform,
      postType: body.postType,
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
      status: body.status,
      images: {
        create: imgs.map((url, i) => ({ url, position: i })),
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
