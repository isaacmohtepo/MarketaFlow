import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getBrandAccess } from "@/lib/permissions";

const createSchema = z.object({
  name: z.string().min(1).max(40),
  tags: z.string().min(1),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const access = await getBrandAccess(user.id, id);
  if (!access) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  const sets = await prisma.hashtagSet.findMany({
    where: { brandId: id },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ sets });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const access = await getBrandAccess(user.id, id);
  if (!access || !access.canEdit) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  let body;
  try {
    body = createSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const set = await prisma.hashtagSet.create({
    data: {
      brandId: id,
      name: body.name,
      tags: normalizeTags(body.tags),
    },
  });
  return NextResponse.json({ set });
}

function normalizeTags(raw: string) {
  // separar por espacios, comas, saltos de línea; agregar # si falta
  return raw
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.startsWith("#") ? t : `#${t}`))
    .join(" ");
}
