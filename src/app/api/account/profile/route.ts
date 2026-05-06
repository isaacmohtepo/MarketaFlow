import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

const schema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  // avatarUrl: solo http(s). z.url() solo permitía URLs válidas pero zod
  // acepta javascript: y data: → posible XSS si se renderiza en <img>.
  avatarUrl: z
    .string()
    .url()
    .refine((u) => /^https?:\/\//i.test(u), "URL debe ser http/https")
    .nullable()
    .optional(),
});

export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.avatarUrl !== undefined ? { avatarUrl: body.avatarUrl } : {}),
    },
    select: { id: true, name: true, avatarUrl: true, email: true },
  });

  return NextResponse.json({ user: updated });
}
