import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getPostAccess } from "@/lib/permissions";

const schema = z.object({
  body: z.string().min(1),
  x: z.number().min(0).max(1).optional(),
  y: z.number().min(0).max(1).optional(),
  parentId: z.string().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const ctx = await getPostAccess(user.id, id);
  if (!ctx) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  let body;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  // Si es respuesta, ignoramos x/y (heredan del padre)
  const isReply = !!body.parentId;
  if (isReply) {
    const parent = await prisma.comment.findUnique({ where: { id: body.parentId } });
    if (!parent || parent.postId !== id) {
      return NextResponse.json({ error: "Comentario padre inválido" }, { status: 400 });
    }
  }

  const comment = await prisma.comment.create({
    data: {
      postId: id,
      userId: user.id,
      body: body.body,
      x: isReply ? null : body.x ?? null,
      y: isReply ? null : body.y ?? null,
      parentId: body.parentId ?? null,
    },
    include: { user: true },
  });

  return NextResponse.json({
    comment: serialize(comment),
  });
}

function serialize(c: {
  id: string;
  body: string;
  x: number | null;
  y: number | null;
  parentId: string | null;
  resolved: boolean;
  createdAt: Date;
  updatedAt: Date;
  user: { name: string | null; email: string };
}) {
  return {
    id: c.id,
    body: c.body,
    x: c.x,
    y: c.y,
    parentId: c.parentId,
    resolved: c.resolved,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    userName: c.user.name ?? c.user.email,
  };
}
