import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getBrandAccess } from "@/lib/permissions";

const schema = z.object({
  name: z.string().min(1).max(80).optional(),
  handle: z.string().max(80).nullable().optional(),
  // logoUrl: solo http(s) externo o /uploads/ local. Bloquea javascript:/data:
  // que serían XSS si se renderiza con <img>.
  logoUrl: z
    .string()
    .refine(
      (u) => /^https?:\/\//i.test(u) || u.startsWith("/uploads/"),
      "URL no permitida",
    )
    .nullable()
    .optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color hex inválido (#RRGGBB)")
    .nullable()
    .optional(),
  bio: z.string().max(280).nullable().optional(),
});

export async function PATCH(
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
    body = schema.parse(await req.json());
  } catch (err) {
    const msg =
      err && typeof err === "object" && "message" in err ? String(err.message) : "Datos inválidos";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const updated = await prisma.brand.update({
    where: { id },
    data: body,
  });
  return NextResponse.json({ brand: updated });
}
