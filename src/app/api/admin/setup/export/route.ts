import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { exportMasterKey } from "@/lib/encryption";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

/**
 * POST /api/admin/setup/export
 *
 * Devuelve la master key actual en plain (hex) UNA VEZ. El cliente la muestra
 * al admin para que la copie a un password manager.
 *
 * Hardening:
 * - Rate limit: 3 exports / hora / admin (la key no debería exportarse seguido).
 * - Audit log: registramos cada export con admin id + IP. Si una sesión de
 *   admin se compromete y el attacker exporta la key, queda trazabilidad.
 * - POST (no GET) para que la key no aparezca en logs de access por URL.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!(await isAdmin(user.id))) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const rl = rateLimit(req, {
    key: "admin-key-export",
    limit: 3,
    windowMs: 60 * 60_000,
    extra: user.id,
  });
  if (!rl.ok) return rateLimitResponse(rl);

  try {
    const value = await exportMasterKey();
    audit({
      category: "admin",
      action: "master_key.exported",
      actorUserId: user.id,
      actorEmail: user.email,
      req,
    });
    return NextResponse.json(
      { value },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No hay key configurada" },
      { status: 404 },
    );
  }
}
