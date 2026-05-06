import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { exportMasterKey } from "@/lib/encryption";

/**
 * POST /api/admin/setup/export
 *
 * Devuelve la master key actual en plain (hex) UNA VEZ. El cliente la muestra
 * al admin para que la copie a un password manager. Solo admins, no se loggea.
 *
 * Usamos POST (no GET) para que no aparezca la key en logs de access (por la
 * URL). El body está vacío.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!(await isAdmin(user.id))) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }
  try {
    const value = await exportMasterKey();
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
