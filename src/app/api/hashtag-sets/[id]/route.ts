import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getBrandAccess } from "@/lib/permissions";

const editSchema = z.object({
  name: z.string().min(1).max(40).optional(),
  tags: z.string().max(5000).optional(),
});

async function loadWithAccess(userId: string, setId: string, mustEdit = false) {
  const set = await prisma.hashtagSet.findUnique({ where: { id: setId } });
  if (!set) return null;
  const access = await getBrandAccess(userId, set.brandId);
  if (!access) return null;
  if (mustEdit && !access.canEdit) return null;
  return { set, access };
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const ctx = await loadWithAccess(user.id, id, true);
  if (!ctx) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  let body;
  try {
    body = editSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const updated = await prisma.hashtagSet.update({
    where: { id },
    data: {
      name: body.name,
      tags: body.tags !== undefined ? normalizeTags(body.tags) : undefined,
    },
  });
  return NextResponse.json({ set: updated });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const ctx = await loadWithAccess(user.id, id, true);
  if (!ctx) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  await prisma.hashtagSet.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

function normalizeTags(raw: string) {
  return raw
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.startsWith("#") ? t : `#${t}`))
    .join(" ");
}
