import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { setPaymentMode, getPaymentMode } from "@/lib/integrations";
import { audit } from "@/lib/audit";

/**
 * GET /api/admin/payment-mode → { mode: "sandbox" | "production" | null }
 * POST /api/admin/payment-mode { mode } → set explicit payment mode
 *
 * El modo elegido lo lee `resolveWompiEnvironment()` cuando un user inicia
 * checkout. Permite al admin alternar entre sandbox (testing con tarjetas
 * de prueba) y production (cobros reales) sin tocar las configs guardadas.
 */
const schema = z.object({
  mode: z.enum(["sandbox", "production"]),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!(await isAdmin(user.id))) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }
  const mode = await getPaymentMode();
  return NextResponse.json({ mode });
}

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
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  await setPaymentMode(body.mode);

  audit({
    category: "admin",
    action: "payment_mode.changed",
    actorUserId: user.id,
    actorEmail: user.email,
    metadata: { mode: body.mode },
    req,
  });

  return NextResponse.json({ ok: true, mode: body.mode });
}
