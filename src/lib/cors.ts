/**
 * Headers CORS para los endpoints públicos del widget embebible (se llaman
 * cross-origin desde los sitios de los clientes).
 *
 * Devolvemos el `Origin` exacto del request (echo) en vez de "*" — es
 * CORS-compliant y deja la puerta abierta a usar credentials en el futuro.
 * Si no vino Origin (curl, server-to-server), caemos a "*".
 *
 * Antes estaba copiado en 3 endpoints (auth-review, feedback, heartbeat).
 */
export function widgetCors(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}
