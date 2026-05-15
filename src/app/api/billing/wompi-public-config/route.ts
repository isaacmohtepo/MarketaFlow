import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getWompiConfig, resolveWompiEnvironment } from "@/lib/integrations";
import { getSystemSetting } from "@/lib/system-settings";

/**
 * GET /api/billing/wompi-public-config
 *
 * Devuelve la public key de Wompi + el acceptance_token actual del
 * merchant. La browser usa esto para tokenizar tarjetas client-side
 * (los datos de la tarjeta NUNCA pasan por nuestro server, evita PCI).
 *
 * El acceptance_token es un JWT que cambia periódicamente — Wompi lo
 * regenera con cada llamada a /merchants/{publicKey}. Lo pedimos en
 * cada request para no servir uno expirado.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const env = await resolveWompiEnvironment();
  if (!env) {
    return NextResponse.json(
      { error: "Wompi no configurado" },
      { status: 503 },
    );
  }
  const cfg = await getWompiConfig(env);

  // Pedir merchant info → trae acceptance_tokens vigentes.
  const apiBase =
    env === "production"
      ? "https://production.wompi.co/v1"
      : "https://sandbox.wompi.co/v1";

  let acceptanceToken: string | null = null;
  let acceptancePersonalDataAuthToken: string | null = null;
  try {
    const res = await fetch(
      `${apiBase}/merchants/${encodeURIComponent(cfg.publicKey)}`,
      { cache: "no-store" },
    );
    if (res.ok) {
      const j = (await res.json()) as {
        data?: {
          presigned_acceptance?: { acceptance_token?: string };
          presigned_personal_data_auth?: { acceptance_token?: string };
        };
      };
      acceptanceToken = j.data?.presigned_acceptance?.acceptance_token ?? null;
      acceptancePersonalDataAuthToken =
        j.data?.presigned_personal_data_auth?.acceptance_token ?? null;
    }
  } catch (err) {
    console.error("Failed to fetch Wompi merchant config", err);
  }

  // Bandera para que el modal sepa si va a hacer el cobro de validación
  // o no — para mostrar (o no) el disclaimer del cargo de $5.000.
  const validationEnabled = await getSystemSetting("paymentValidationEnabled");

  return NextResponse.json({
    publicKey: cfg.publicKey,
    environment: env,
    apiBase,
    acceptanceToken,
    acceptancePersonalDataAuthToken,
    validationEnabled,
  });
}
