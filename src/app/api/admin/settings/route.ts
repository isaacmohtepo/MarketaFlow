import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { audit } from "@/lib/audit";
import {
  listSystemSettings,
  setSystemSetting,
  SETTING_KEYS,
  type SettingKey,
} from "@/lib/system-settings";

/**
 * GET /api/admin/settings → lista de settings con valores resueltos
 * POST /api/admin/settings { key, value } → setear un valor
 */
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!(await isAdmin(me.id))) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }
  const items = await listSystemSettings();
  return NextResponse.json({ items });
}

const postSchema = z.object({
  key: z.enum(SETTING_KEYS),
  // Aceptamos number / boolean / string — el helper valida contra el def
  // del setting específico (rangos, regex de email, etc.).
  value: z.union([z.number(), z.boolean(), z.string().max(500)]),
});

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!(await isAdmin(me.id))) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  let body;
  try {
    body = postSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await setSystemSetting(body.key as SettingKey, body.value as any);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  audit({
    category: "admin",
    action: "system_setting.changed",
    actorUserId: me.id,
    actorEmail: me.email,
    metadata: { key: body.key, value: body.value },
    req,
  });

  return NextResponse.json({ ok: true });
}
