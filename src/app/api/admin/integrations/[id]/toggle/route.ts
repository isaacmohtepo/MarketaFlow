import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { toggleConfig } from "@/lib/integrations";

const schema = z.object({ enabled: z.boolean() });

/**
 * POST /api/admin/integrations/[id]/toggle
 * Habilita/deshabilita una config sin re-encriptar las llaves. Solo admins.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
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

  const row = await toggleConfig(id, body.enabled);
  return NextResponse.json({ id: row.id, enabled: row.enabled });
}
