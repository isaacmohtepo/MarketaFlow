import { NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { startTrialForAgency } from "@/lib/billing";
import { generateAgencySlug } from "@/lib/slugs";
import {
  WORKSPACE_COOKIE,
  WORKSPACE_COOKIE_MAX_AGE,
} from "@/lib/active-agency";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/workspace/create { name }
 *
 * Crea una NUEVA agencia (workspace propio) con el user como owner y arranca
 * su trial. Acción deliberada: a diferencia de un invitado (que usa el plan de
 * la empresa), tu propia agencia tiene su suscripción independiente. Después
 * del trial, se paga aparte.
 *
 * Deja la nueva agencia como workspace activo (cookie) para entrar directo.
 */
const schema = z.object({
  name: z.string().trim().min(1, "Falta el nombre").max(80),
});

// Tope anti-abuso: cuántas agencias puede tener un mismo user como owner.
// Cada agencia arranca un trial; sin tope alguien podría farmear trials.
const MAX_OWNED_AGENCIES = 10;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    const msg = e instanceof z.ZodError ? e.issues[0]?.message : "Datos inválidos";
    return NextResponse.json({ error: msg ?? "Datos inválidos" }, { status: 400 });
  }

  const owned = await prisma.membership.count({
    where: { userId: user.id, role: "owner", brandId: null },
  });
  if (owned >= MAX_OWNED_AGENCIES) {
    return NextResponse.json(
      { error: "Llegaste al máximo de agencias propias. Contacta a soporte." },
      { status: 403 },
    );
  }

  // Anti-abuso: cada agencia nueva arranca un TRIAL — sin límite temporal se
  // podían farmear trials creando muchas agencias de golpe. Máx 2 por día.
  const recentOwned = await prisma.membership.count({
    where: {
      userId: user.id,
      role: "owner",
      brandId: null,
      agency: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    },
  });
  if (recentOwned >= 2) {
    return NextResponse.json(
      { error: "Máximo 2 agencias nuevas por día. Intenta mañana." },
      { status: 429 },
    );
  }

  // Crear agencia + membership owner atómico.
  const agencySlug = await generateAgencySlug(body.name);
  const membership = await prisma.membership.create({
    data: {
      user: { connect: { id: user.id } },
      role: "owner",
      agency: { create: { name: body.name, slug: agencySlug } },
    },
    select: { agencyId: true },
  });

  // Si el user era "client" (ej. invitado), al crear su agencia pasa a ser
  // staff de agencia. No tocamos admins.
  if (user.role === "client") {
    await prisma.user.update({
      where: { id: user.id },
      data: { role: "agency" },
    });
  }

  // Trial de onboarding (mismo que el signup normal).
  await startTrialForAgency(membership.agencyId);

  // Entrar directo a la nueva agencia.
  const jar = await cookies();
  jar.set(WORKSPACE_COOKIE, membership.agencyId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: WORKSPACE_COOKIE_MAX_AGE,
    path: "/",
  });

  return NextResponse.json({ ok: true, agencyId: membership.agencyId });
}
