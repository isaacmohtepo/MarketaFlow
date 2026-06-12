import { PrismaClient } from "@/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  const adapter = new PrismaPg({
    connectionString: url,
    // ESCALABILIDAD (serverless): cada instancia de función mantiene su
    // propio pool. Sin límite, el default de pg es 10 conexiones POR
    // instancia — con decenas de instancias concurrentes se agota el pooler
    // de Neon. 5 por instancia es más que suficiente (las queries son cortas)
    // y deja margen para muchas más instancias en paralelo.
    max: 5,
    // Soltar conexiones idle rápido para que el pooler las recicle.
    idleTimeoutMillis: 30_000,
    // No esperar indefinidamente si el pool está saturado.
    connectionTimeoutMillis: 10_000,
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/**
 * Reintenta una transacción Serializable cuando Postgres aborta por conflicto
 * de serialización (Prisma P2034). Con dos requests concurrentes (ej. dos
 * usuarios creando un post a la vez), Postgres aborta UNA a propósito — sin
 * retry, ese usuario veía un error 500 espurio. 3 intentos con backoff corto
 * resuelven prácticamente todos los casos.
 */
export async function withSerializableRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const code = (err as { code?: string } | null)?.code;
      if (code !== "P2034") throw err;
      // Backoff: 30ms, 90ms (jitter implícito por el scheduling).
      await new Promise((r) => setTimeout(r, 30 * Math.pow(3, i)));
    }
  }
  throw lastErr;
}
