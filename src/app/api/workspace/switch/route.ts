import { NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  WORKSPACE_COOKIE,
  WORKSPACE_COOKIE_MAX_AGE,
} from "@/lib/active-agency";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/workspace/switch { agencyId }
 *
 * Cambia el workspace (agencia) activo del usuario. Valida que el user tenga
 * membership en esa agencia (gate cross-tenant) y setea la cookie
 * `mf_workspace`. El cliente hace router.refresh() para que el layout
 * re-resuelva todo sobre la nueva agencia.
 *
 * La cookie nunca otorga acceso: solo selecciona entre agencias que el user
 * YA tiene. Cada lectura la re-valida (lib/active-agency.ts).
 */
const schema = z.object({ agencyId: z.string().min(1) });

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  // Gate cross-tenant: el user debe tener membership en la agencia objetivo.
  // No revelamos si la agencia existe — 403 genérico si no es miembro.
  const membership = await prisma.membership.findFirst({
    where: { userId: user.id, agencyId: body.agencyId },
    select: { id: true },
  });
  if (!membership) {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }

  const jar = await cookies();
  jar.set(WORKSPACE_COOKIE, body.agencyId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: WORKSPACE_COOKIE_MAX_AGE,
    path: "/",
  });

  return NextResponse.json({ ok: true });
}
