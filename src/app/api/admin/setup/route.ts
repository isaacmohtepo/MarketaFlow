import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { generateAndSaveMasterKey, hasMasterKey } from "@/lib/encryption";

/**
 * GET /api/admin/setup → estado del setup (hasMasterKey)
 * POST /api/admin/setup → genera y persiste master key en DB (one-time)
 *
 * Solo admin. La key generada NUNCA se devuelve al cliente — vive solo en DB.
 */

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!(await isAdmin(user.id))) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }
  return NextResponse.json({ hasMasterKey: await hasMasterKey() });
}

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!(await isAdmin(user.id))) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }
  try {
    await generateAndSaveMasterKey();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error desconocido" },
      { status: 400 },
    );
  }
}
