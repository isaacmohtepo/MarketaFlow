import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { rotateMasterKey } from "@/lib/encryption";

const schema = z.object({
  reason: z.string().max(500).optional(),
  /** Confirmación: el cliente debe enviar este string exacto para evitar
   *  rotaciones accidentales. */
  confirmation: z.literal("ROTATE"),
});

/**
 * POST /api/admin/setup/rotate
 *
 * Rota la master key + re-encripta todas las configs de pasarelas. Es
 * atómico (rollback si algo falla) y zero-downtime para el cron de billing.
 *
 * Solo admins. Requiere `confirmation: "ROTATE"` en el body para evitar
 * rotaciones por error.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!(await isAdmin(user.id))) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json(
      { error: "Falta confirmación. Body debe incluir confirmation: 'ROTATE'" },
      { status: 400 },
    );
  }

  try {
    const result = await rotateMasterKey({
      userId: user.id,
      userEmail: user.email,
      reason: body.reason,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error en la rotación" },
      { status: 500 },
    );
  }
}
