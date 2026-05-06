import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import {
  upsertConfig,
  type IntegrationCategory,
  type IntegrationProvider,
  type IntegrationEnvironment,
} from "@/lib/integrations";
import { audit } from "@/lib/audit";

const schema = z.object({
  category: z.enum(["payment", "notification", "ai", "storage"]),
  provider: z.string().min(1).max(50),
  environment: z.enum(["sandbox", "production"]),
  config: z.record(z.string(), z.string()),
  enabled: z.boolean().optional(),
});

/**
 * POST /api/admin/integrations
 * Crear/actualizar config de una integración. Solo admins.
 *
 * Body: { category, provider, environment, config, enabled? }
 *
 * El `config` es un objeto plano con las llaves (publicKey, privateKey, etc.).
 * Se encripta entero antes de guardar. El `publicMeta` se deriva
 * server-side con info no-secreta.
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
  } catch (err) {
    return NextResponse.json(
      { error: "Datos inválidos", detail: String(err) },
      { status: 400 },
    );
  }

  // Derivar publicMeta no-secreto desde el config — depende del provider
  const publicMeta = derivePublicMeta(body.provider, body.config);

  const row = await upsertConfig({
    category: body.category as IntegrationCategory,
    provider: body.provider as IntegrationProvider,
    environment: body.environment as IntegrationEnvironment,
    config: body.config,
    publicMeta,
    enabled: body.enabled ?? true,
  });

  // Log inmutable (no incluye llaves, solo provider+env y action)
  audit({
    category: "integrations",
    action: "config.upserted",
    actorUserId: user.id,
    actorEmail: user.email,
    targetId: row.id,
    metadata: {
      provider: body.provider,
      environment: body.environment,
      enabled: row.enabled,
    },
    req,
  });

  return NextResponse.json({ id: row.id, enabled: row.enabled });
}

function derivePublicMeta(provider: string, config: Record<string, string>) {
  const meta: Record<string, string> = {
    configuredAt: new Date().toISOString(),
  };
  // Para Wompi/Stripe/etc., guardamos el prefix de la public key (no es
  // secreto, sirve para verificar que está bien configurado).
  const publicKey =
    config.publicKey ?? config.publishableKey ?? config.apiKey ?? "";
  if (publicKey) {
    meta.publicKeyPrefix = publicKey.slice(0, 12) + "…";
  }
  return meta;
}
