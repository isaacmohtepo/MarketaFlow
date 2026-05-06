/**
 * Helpers para responder errores de forma segura. Evitan leak de stack traces,
 * paths internos, queries DB, etc. al cliente — el detalle completo queda
 * en el log del servidor.
 *
 * Convención:
 * - El cliente recibe SOLO un mensaje genérico + código de error opcional
 * - El servidor loggea el error real con `console.error` (Vercel lo captura)
 *
 * Si el caller quiere mensajes específicos para 4xx, los pasa explícitamente.
 * Para 5xx, NUNCA pasar el error original al cliente.
 */

import { NextResponse } from "next/server";

/**
 * Loggea el error en server y devuelve 500 con un mensaje genérico.
 * El `context` es solo para logs (no se manda al cliente).
 */
export function serverError(context: string, err: unknown) {
  console.error(`[${context}]`, err);
  return NextResponse.json(
    { error: "Algo salió mal. Si persiste, contactanos." },
    { status: 500 },
  );
}

/** 400 con mensaje seguro (controlado por el caller). */
export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

/** 401 estándar. */
export function unauthorized() {
  return NextResponse.json({ error: "No autorizado" }, { status: 401 });
}

/** 403 estándar. */
export function forbidden(message?: string) {
  return NextResponse.json(
    { error: message ?? "Sin permisos" },
    { status: 403 },
  );
}

/** 404 estándar. */
export function notFound(message?: string) {
  return NextResponse.json(
    { error: message ?? "No encontrado" },
    { status: 404 },
  );
}

/** 402 con info para el modal de upgrade del cliente. */
export function paymentRequired(opts: {
  reason: string;
  currentCount?: number;
  limit?: number;
  suggestedPlan?: "free" | "pro" | "agency";
}) {
  return NextResponse.json(
    {
      error: opts.reason,
      currentCount: opts.currentCount,
      limit: opts.limit,
      suggestedPlan: opts.suggestedPlan,
    },
    { status: 402 },
  );
}
