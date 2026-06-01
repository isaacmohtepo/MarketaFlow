import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser, verifyPassword, destroySession } from "@/lib/auth";

const schema = z.object({
  password: z.string().min(1),
  confirm: z.literal("ELIMINAR"),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json(
      { error: "Para confirmar tienes que escribir ELIMINAR y tu contraseña." },
      { status: 400 },
    );
  }

  const full = await prisma.user.findUnique({ where: { id: user.id } });
  if (!full) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  const ok = await verifyPassword(body.password, full.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "Contraseña incorrecta." }, { status: 400 });
  }

  // Bloquea si el usuario es ÚNICO owner de una agencia con otros miembros — eso dejaría a la agencia huérfana.
  const ownerships = await prisma.membership.findMany({
    where: { userId: user.id, role: "owner", brandId: null },
    select: { agencyId: true },
  });
  for (const o of ownerships) {
    const otherOwners = await prisma.membership.count({
      where: {
        agencyId: o.agencyId,
        role: "owner",
        brandId: null,
        userId: { not: user.id },
      },
    });
    if (otherOwners === 0) {
      const memberCount = await prisma.membership.count({
        where: { agencyId: o.agencyId, userId: { not: user.id } },
      });
      if (memberCount > 0) {
        return NextResponse.json(
          {
            error:
              "Eres el único dueño de una agencia con otros miembros. Transfiere la propiedad o elimina la agencia primero.",
          },
          { status: 400 },
        );
      }
    }
  }

  // Hard delete — Prisma cascade limpia memberships, sessions, comments, approvals, notifications.
  // PostView y Presence no tienen relación FK, los limpiamos a mano.
  await prisma.$transaction([
    prisma.postView.deleteMany({ where: { userId: user.id } }),
    prisma.presence.deleteMany({ where: { userId: user.id } }),
    prisma.user.delete({ where: { id: user.id } }),
  ]);

  // Limpia la cookie de sesión usando el nombre correcto según env
  // (mf_session en dev, __Host-mf_session en prod). destroySession ya
  // intenta borrar el token del DB pero ese ya se borró por cascade.
  await destroySession();

  return NextResponse.json({ ok: true });
}
