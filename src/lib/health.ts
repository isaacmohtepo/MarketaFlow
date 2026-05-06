/**
 * Health checks de servicios externos. Ejecuta cada uno con timeout corto y
 * devuelve un estado normalizado para mostrar en el dashboard de admin.
 *
 * No tiramos excepciones — capturamos todo y devolvemos { ok, latencyMs, error }.
 */

import { prisma } from "./db";
import { resolveWompiEnvironment, getActiveConfig } from "./integrations";

export type CheckResult = {
  name: string;
  ok: boolean;
  latencyMs: number | null;
  message: string;
  detail?: string;
};

const TIMEOUT_MS = 6000;

async function withTimeout<T>(p: Promise<T>, label: string): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout`)), TIMEOUT_MS),
    ),
  ]);
}

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const start = Date.now();
  const result = await fn();
  return { result, ms: Date.now() - start };
}

// ============================================================================

export async function checkDatabase(): Promise<CheckResult> {
  try {
    const { ms } = await timed(() =>
      withTimeout(prisma.$queryRaw`SELECT 1`, "db"),
    );
    return {
      name: "PostgreSQL (Neon)",
      ok: true,
      latencyMs: ms,
      message: "Conexión OK",
    };
  } catch (err) {
    return {
      name: "PostgreSQL (Neon)",
      ok: false,
      latencyMs: null,
      message: "Connection error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function checkR2(): Promise<CheckResult> {
  // R2 está configurado via env vars (no DB). Hacemos un HEAD al bucket
  // público para validar que responde.
  const url = process.env.R2_PUBLIC_URL ?? "https://pub-77b716a803224625943a1a96c345eb45.r2.dev";
  try {
    const { ms } = await timed(() =>
      withTimeout(
        fetch(url, { method: "HEAD" }),
        "r2",
      ),
    );
    return {
      name: "Cloudflare R2 (storage)",
      ok: true,
      latencyMs: ms,
      message: "Bucket accesible",
    };
  } catch (err) {
    return {
      name: "Cloudflare R2 (storage)",
      ok: false,
      latencyMs: null,
      message: "No respondió",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function checkWompi(): Promise<CheckResult> {
  try {
    const env = await resolveWompiEnvironment();
    if (!env) {
      return {
        name: "Wompi (pasarela)",
        ok: false,
        latencyMs: null,
        message: "No configurado",
        detail: "Configurá las llaves en /admin/integrations",
      };
    }
    const cfg = await getActiveConfig<{ publicKey: string }>("wompi", env);
    if (!cfg) {
      return {
        name: "Wompi (pasarela)",
        ok: false,
        latencyMs: null,
        message: "Config inválida",
      };
    }
    const apiBase =
      env === "production"
        ? "https://production.wompi.co/v1"
        : "https://sandbox.wompi.co/v1";
    const { result, ms } = await timed(() =>
      withTimeout(
        fetch(`${apiBase}/merchants/${encodeURIComponent(cfg.publicKey)}`),
        "wompi",
      ),
    );
    if (!result.ok) {
      return {
        name: `Wompi ${env === "production" ? "PROD" : "sandbox"}`,
        ok: false,
        latencyMs: ms,
        message: `HTTP ${result.status}`,
      };
    }
    return {
      name: `Wompi ${env === "production" ? "PROD" : "sandbox"}`,
      ok: true,
      latencyMs: ms,
      message: "Llaves válidas",
    };
  } catch (err) {
    return {
      name: "Wompi (pasarela)",
      ok: false,
      latencyMs: null,
      message: "Error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function checkAnthropic(): Promise<CheckResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      name: "Anthropic (AI captions)",
      ok: false,
      latencyMs: null,
      message: "ANTHROPIC_API_KEY no seteada",
      detail: "Setealo en Vercel para habilitar AI",
    };
  }
  // No hacemos call real porque cuesta tokens. Solo verificamos que
  // la key existe con shape esperado.
  const k = process.env.ANTHROPIC_API_KEY;
  if (!k.startsWith("sk-ant-")) {
    return {
      name: "Anthropic (AI captions)",
      ok: false,
      latencyMs: null,
      message: "Formato de key inválido",
    };
  }
  return {
    name: "Anthropic (AI captions)",
    ok: true,
    latencyMs: null,
    message: "Key configurada",
  };
}

export async function checkMasterKey(): Promise<CheckResult> {
  try {
    const row = await prisma.systemConfig.findUnique({
      where: { key: "ENCRYPTION_KEY" },
    });
    if (row?.value) {
      return {
        name: "Master key (encriptación)",
        ok: true,
        latencyMs: null,
        message: "Configurada en DB",
      };
    }
    if (process.env.INTEGRATION_ENCRYPTION_KEY) {
      return {
        name: "Master key (encriptación)",
        ok: true,
        latencyMs: null,
        message: "Configurada via env var (legacy)",
      };
    }
    return {
      name: "Master key (encriptación)",
      ok: false,
      latencyMs: null,
      message: "No configurada",
      detail: "Andá a /admin/setup para generarla",
    };
  } catch (err) {
    return {
      name: "Master key (encriptación)",
      ok: false,
      latencyMs: null,
      message: "Error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function checkRecentWebhooks(): Promise<CheckResult> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [total, errors, sigInvalid] = await Promise.all([
    prisma.webhookEvent.count({ where: { receivedAt: { gte: since } } }),
    prisma.webhookEvent.count({
      where: { receivedAt: { gte: since }, status: "error" },
    }),
    prisma.webhookEvent.count({
      where: { receivedAt: { gte: since }, status: "signature_invalid" },
    }),
  ]);
  if (total === 0) {
    return {
      name: "Webhooks (últimas 24h)",
      ok: true,
      latencyMs: null,
      message: "Sin actividad",
    };
  }
  if (sigInvalid > 0) {
    return {
      name: "Webhooks (últimas 24h)",
      ok: false,
      latencyMs: null,
      message: `${sigInvalid} con firma inválida de ${total}`,
      detail: "Verificá events_secret en /admin/integrations",
    };
  }
  if (errors > 0) {
    return {
      name: "Webhooks (últimas 24h)",
      ok: false,
      latencyMs: null,
      message: `${errors} errores de ${total}`,
    };
  }
  return {
    name: "Webhooks (últimas 24h)",
    ok: true,
    latencyMs: null,
    message: `${total} procesados OK`,
  };
}

// ============================================================================

export async function runAllChecks(): Promise<CheckResult[]> {
  return Promise.all([
    checkDatabase(),
    checkMasterKey(),
    checkR2(),
    checkWompi(),
    checkAnthropic(),
    checkRecentWebhooks(),
  ]);
}
