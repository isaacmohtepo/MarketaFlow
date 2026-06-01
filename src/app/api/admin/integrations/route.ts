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
  } catch {
    // No echo del zod error — el detail puede leakear field paths internos.
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  // Validar que los prefijos de las llaves matcheen el environment elegido.
  // Esto cierra el error #1 que veíamos: cargar `prv_test_*` en "production"
  // y que después Wompi rechace el checkout con 401.
  const mismatch = validateKeyEnvironment(
    body.provider,
    body.environment,
    body.config,
  );
  if (mismatch) {
    return NextResponse.json({ error: mismatch }, { status: 400 });
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

/**
 * Verifica que los prefijos de las llaves correspondan al environment elegido.
 * Devuelve un mensaje de error legible o null si todo OK.
 *
 * Wompi usa `pub_test_` / `prv_test_` para sandbox y `pub_prod_` / `prv_prod_`
 * para producción. Stripe usa `pk_test_` / `sk_test_` (sandbox) y
 * `pk_live_` / `sk_live_` (producción).
 */
function validateKeyEnvironment(
  provider: string,
  environment: "sandbox" | "production",
  config: Record<string, string>,
): string | null {
  if (provider === "wompi") {
    const expectedPrefix = environment === "production" ? "_prod_" : "_test_";
    const otherEnv = environment === "production" ? "sandbox" : "production";
    const otherPrefix = environment === "production" ? "_test_" : "_prod_";

    const checks: { key: string; label: string }[] = [
      { key: "publicKey", label: "Public Key" },
      { key: "privateKey", label: "Private Key" },
    ];
    for (const c of checks) {
      const v = config[c.key];
      if (!v) continue;
      if (v.includes(otherPrefix)) {
        return `${c.label} parece ser de ${otherEnv} (contiene "${otherPrefix.replace(/_/g, "")}") pero estás guardandola en ${environment}. Movela al ambiente correcto o usa llaves de ${environment}.`;
      }
      if (!v.includes(expectedPrefix)) {
        return `${c.label} no tiene el formato esperado para ${environment} (debería contener "${expectedPrefix.replace(/_/g, "")}").`;
      }
    }
  }

  if (provider === "stripe") {
    const expected = environment === "production" ? "_live_" : "_test_";
    const other = environment === "production" ? "_test_" : "_live_";
    const otherEnv = environment === "production" ? "sandbox" : "production";
    const checks: { key: string; label: string }[] = [
      { key: "publishableKey", label: "Publishable Key" },
      { key: "secretKey", label: "Secret Key" },
    ];
    for (const c of checks) {
      const v = config[c.key];
      if (!v) continue;
      if (v.includes(other)) {
        return `${c.label} parece ser de ${otherEnv}. Movela al ambiente correcto.`;
      }
      if (!v.includes(expected)) {
        return `${c.label} no tiene el formato esperado para ${environment}.`;
      }
    }
  }

  return null;
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
