import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

/**
 * POST /api/account/onboarding { completed: boolean }
 *
 * Marca el onboarding como completado (o lo resetea con completed=false).
 * Usado por el wizard de /onboarding para terminar.
 */
const schema = z.object({ completed: z.boolean() });

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { onboardingCompletedAt: body.completed ? new Date() : null },
  });

  return NextResponse.json({ ok: true });
}
