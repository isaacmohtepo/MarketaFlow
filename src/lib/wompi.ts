/**
 * Cliente para la API de Wompi (Bancolombia). Las llaves se leen de la DB
 * via `getWompiConfig()` — no de env. Esto permite cambiar de sandbox a
 * producción desde el admin panel sin redeploy.
 *
 * Docs: https://docs.wompi.co
 *
 * Implementamos los endpoints que MarketaFlow necesita:
 * - Crear payment link (Checkout web hosted)
 * - Consultar transacción
 * - Tokenizar tarjeta para cobros recurrentes
 * - Cobrar con token (subscription renewal)
 * - Validar firma de webhook
 */

import { createHash, randomUUID } from "crypto";
import { getWompiConfig, type WompiConfig, type IntegrationEnvironment } from "./integrations";

const PRODUCTION_API = "https://production.wompi.co/v1";
const SANDBOX_API = "https://sandbox.wompi.co/v1";

function apiBase(env: IntegrationEnvironment) {
  return env === "production" ? PRODUCTION_API : SANDBOX_API;
}

export type WompiTransactionStatus =
  | "PENDING"
  | "APPROVED"
  | "DECLINED"
  | "VOIDED"
  | "ERROR";

export type WompiTransaction = {
  id: string;
  status: WompiTransactionStatus;
  reference: string;
  amount_in_cents: number;
  currency: string;
  customer_email?: string;
  payment_method_type?: string;
  payment_source_id?: number;
  /** Detalle del método usado (cuando GET /transactions/{id}). */
  payment_method?: {
    type?: string;
    /** Token reusable de la tarjeta (Payment Links no crean payment_source
     *  pero sí devuelven este token que sirve para POST /payment_sources). */
    token?: string;
    /** Solo NEQUI: teléfono enmascarado del titular. */
    phone_number?: string;
    /** Solo CARD: detalles para display (last4, brand, exp, holder). */
    extra?: {
      name?: string;
      brand?: string;
      last_four?: string;
      exp_year?: string;
      exp_month?: string;
      card_holder?: string;
    };
  };
  status_message?: string | null;
  created_at: string;
  finalized_at?: string;
};

export type WompiPaymentLinkResponse = {
  data: {
    id: string; // Wompi payment link id
    // Wompi devuelve la URL hosted en `permalink`. En docs viejos aparece
    // como `public_url`; mantenemos ambos opcionales para compatibilidad.
    permalink?: string;
    public_url?: string;
  };
};

/**
 * Genera la firma de integridad que Wompi requiere para crear payment links.
 * Formato: SHA-256 hex de `{reference}{amount_in_cents}{currency}{integritySecret}`
 *
 * Si hay expiration_time se incluye antes del secret. Ver docs de Wompi.
 */
export function buildIntegritySignature(args: {
  reference: string;
  amountInCents: number;
  currency: string;
  expirationTime?: string;
  integritySecret: string;
}): string {
  const { reference, amountInCents, currency, expirationTime, integritySecret } = args;
  const parts = [reference, String(amountInCents), currency];
  if (expirationTime) parts.push(expirationTime);
  parts.push(integritySecret);
  return createSha256Hex(parts.join(""));
}

function createSha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Verifica la firma de un evento webhook de Wompi.
 *
 * Wompi NO firma el body crudo con HMAC. El algoritmo es:
 *  1. Tomar los valores del evento listados en signature.properties
 *     (ej. ["transaction.id", "transaction.status", "transaction.amount_in_cents"])
 *  2. Concatenarlos EN ORDEN, sin separador
 *  3. Concatenar el timestamp del evento
 *  4. Concatenar el eventsSecret
 *  5. SHA-256 plain hash (NO HMAC)
 *  6. Comparar con signature.checksum (case-insensitive)
 *
 * Docs: https://docs.wompi.co/docs/colombia/eventos
 */
export function verifyEventSignature(args: {
  event: WompiEventPayload;
  eventsSecret: string;
}): boolean {
  const { event, eventsSecret } = args;
  const sig = event.signature;
  if (!sig?.checksum || !Array.isArray(sig.properties)) return false;
  if (event.timestamp == null) return false;

  // Resolver cada property como path "transaction.id" → event.data.transaction.id
  const values: string[] = [];
  for (const prop of sig.properties) {
    const v = resolvePath(event.data, prop);
    if (v == null) return false; // property faltante = firma inválida
    values.push(String(v));
  }
  const concat = values.join("") + String(event.timestamp) + eventsSecret;
  const computed = createHash("sha256").update(concat, "utf8").digest("hex");

  const expected = sig.checksum.toLowerCase();
  const got = computed.toLowerCase();
  if (expected.length !== got.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) {
    diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

/** Resuelve un path tipo "transaction.id" sobre un objeto. */
function resolvePath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

/** Shape mínimo de un evento Wompi para verificar firma. */
export type WompiEventPayload = {
  event?: string;
  data?: unknown;
  timestamp?: number | string;
  signature?: { checksum: string; properties: string[] };
};

/**
 * Crea un payment link (Checkout Web hosted) para que el usuario pague el
 * primer cobro de la subscription. Wompi nos da una URL pública a la que
 * redirigimos al cliente.
 *
 * Cuando el cliente complete el pago, Wompi nos avisa via webhook
 * (`transaction.updated`) y ahí marcamos la subscription como activa.
 */
export async function createPaymentLink(args: {
  reference: string;
  amountInCents: number;
  currency?: "COP";
  description: string;
  customerEmail?: string;
  /** Customer data pre-fills + ayuda al anti-fraude de Wompi a confiar
   *  en la transacción. Más datos identificables = menos chance de WS02.
   *  Cualquier campo opcional — si no lo tienes, Wompi muestra el form vacío. */
  customerData?: {
    fullName?: string | null;
    phoneNumber?: string | null;
    legalId?: string | null;
    legalIdType?: "CC" | "CE" | "NIT" | "PP" | null;
  };
  redirectUrl: string;
  /** Métodos de pago habilitados. Default: tarjeta + PSE + Nequi. */
  paymentMethods?: ("CARD" | "PSE" | "NEQUI" | "BANCOLOMBIA_TRANSFER")[];
  environment?: IntegrationEnvironment;
}): Promise<WompiPaymentLinkResponse> {
  const env = args.environment ?? "sandbox";
  const cfg = await getWompiConfig(env);
  const url = `${apiBase(env)}/payment_links`;

  // Customer data en el formato que pide Wompi. Solo incluimos campos
  // presentes — Wompi rechaza si pasamos null/undefined explícitos.
  const customerInfo: Record<string, string> = {};
  if (args.customerEmail) customerInfo.email = args.customerEmail;
  if (args.customerData?.fullName) customerInfo.full_name = args.customerData.fullName;
  if (args.customerData?.phoneNumber) customerInfo.phone_number = args.customerData.phoneNumber;
  if (args.customerData?.legalId) customerInfo.legal_id = args.customerData.legalId;
  if (args.customerData?.legalIdType)
    customerInfo.legal_id_type = args.customerData.legalIdType;

  const body: Record<string, unknown> = {
    name: args.description,
    description: args.description,
    single_use: true,
    collect_shipping: false,
    currency: args.currency ?? "COP",
    amount_in_cents: args.amountInCents,
    payment_methods: args.paymentMethods ?? ["CARD", "PSE", "NEQUI"],
    redirect_url: args.redirectUrl,
  };
  if (Object.keys(customerInfo).length > 0) {
    body.customer_data = customerInfo;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.privateKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Wompi createPaymentLink falló (${res.status}): ${errText}`);
  }
  return (await res.json()) as WompiPaymentLinkResponse;
}

/** Consulta una transacción por ID (para validar el resultado del checkout). */
export async function getTransaction(
  transactionId: string,
  environment: IntegrationEnvironment = "sandbox",
): Promise<WompiTransaction> {
  const cfg = await getWompiConfig(environment);
  const url = `${apiBase(environment)}/transactions/${transactionId}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${cfg.privateKey}` },
  });
  if (!res.ok) {
    throw new Error(`Wompi getTransaction falló (${res.status})`);
  }
  const json = (await res.json()) as { data: WompiTransaction };
  return json.data;
}

/**
 * Cobra usando un payment_source_id (token de tarjeta vault) — para
 * renovaciones de subscription. Wompi requiere generar la firma de
 * integridad antes.
 */
export async function chargeWithToken(args: {
  reference: string;
  amountInCents: number;
  currency?: "COP";
  customerEmail: string;
  paymentSourceId: number;
  /** "CARD" | "NEQUI" — tipo del payment_source guardado. Default CARD. */
  paymentMethodType?: "CARD" | "NEQUI";
  description?: string;
  environment?: IntegrationEnvironment;
}): Promise<WompiTransaction> {
  const env = args.environment ?? "sandbox";
  const cfg = await getWompiConfig(env);
  const currency = args.currency ?? "COP";
  const signature = buildIntegritySignature({
    reference: args.reference,
    amountInCents: args.amountInCents,
    currency,
    integritySecret: cfg.integritySecret,
  });

  // El payment_method.type debe coincidir con el tipo del payment_source
  // guardado. Para CARD se incluye `installments`; para NEQUI no.
  const methodType = args.paymentMethodType ?? "CARD";
  const paymentMethod =
    methodType === "NEQUI"
      ? { type: "NEQUI" as const }
      : { type: "CARD" as const, installments: 1 };

  const body = {
    acceptance_token: undefined as undefined,
    amount_in_cents: args.amountInCents,
    currency,
    customer_email: args.customerEmail,
    payment_method: paymentMethod,
    payment_source_id: args.paymentSourceId,
    reference: args.reference,
    signature,
  };

  const res = await fetch(`${apiBase(env)}/transactions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.privateKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Wompi chargeWithToken falló (${res.status}): ${errText}`);
  }
  const json = (await res.json()) as { data: WompiTransaction };
  return json.data;
}

/**
 * Anula (void) o reembolsa parcialmente una transacción aprobada de Wompi.
 *
 * Endpoint: POST /v1/transactions/{id}/void
 *   - Sin body → void total (anula la transacción completa)
 *   - Con body { amount_in_cents } → refund parcial
 *
 * Restricciones:
 *   - Void total funciona dentro de la ventana del banco (típicamente 24h
 *     antes del settlement)
 *   - Refunds parciales pueden requerir aprobación del adquirente
 *   - En sandbox funciona siempre para testing
 *
 * Si la API rechaza, el caller recibe un Error con el detail de Wompi para
 * mostrarle al admin (típicamente "ventana cerrada" o "monto inválido").
 */
export async function voidTransaction(
  transactionId: string,
  environment: IntegrationEnvironment = "sandbox",
  amountInCents?: number,
): Promise<{ status: string; message?: string }> {
  const cfg = await getWompiConfig(environment);
  const url = `${apiBase(environment)}/transactions/${transactionId}/void`;
  const init: RequestInit = {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.privateKey}`,
      "Content-Type": "application/json",
    },
  };
  if (typeof amountInCents === "number" && amountInCents > 0) {
    init.body = JSON.stringify({ amount_in_cents: amountInCents });
  }
  const res = await fetch(url, init);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Wompi void/refund falló (${res.status}): ${text}`);
  }
  try {
    const j = JSON.parse(text) as { data?: { status?: string } };
    return { status: j.data?.status ?? "VOIDED", message: text };
  } catch {
    return { status: "VOIDED", message: text };
  }
}

/**
 * Genera una reference única para una transacción. Wompi usa esto como
 * idempotency key + para encontrar la subscription/invoice asociada.
 *
 * Formato: mf_<subscriptionId>_<timestamp>_<random>
 */
export function generateReference(subscriptionId: string): string {
  return `mf_${subscriptionId}_${Date.now()}_${randomUUID().slice(0, 8)}`;
}

/** Re-export de tipos para callers. */
export type { WompiConfig };
