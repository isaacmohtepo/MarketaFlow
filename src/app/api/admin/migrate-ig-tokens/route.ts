import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { audit } from "@/lib/audit";
import { migrateLegacyTokens } from "@/lib/instagram-token";

/**
 * POST /api/admin/migrate-ig-tokens
 *
 * One-shot migration que encripta todos los Brand.igAccessToken plain →
 * igAccessTokenEnc. Idempotente: si ya están encriptados, solo limpia el
 * legacy plain. Solo accesible para admins del sistema.
 *
 * Pre-requisito: master key configurada (lib/encryption.ts). Si no hay,
 * lanza un error legible.
 */
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!(await isAdmin(me.id))) {
    return NextResponse.json({ error: "Sin permisos de admin" }, { status: 403 });
  }

  try {
    const result = await migrateLegacyTokens();
    audit({
      category: "admin",
      action: "ig_tokens.migrated",
      actorUserId: me.id,
      actorEmail: me.email,
      metadata: result,
      req,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Error desconocido durante la migración",
      },
      { status: 500 },
    );
  }
}
