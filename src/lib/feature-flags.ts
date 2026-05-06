/**
 * Feature flags global del SaaS.
 *
 * A diferencia de los `Agency.featureFlags` (per-agency), estos son flags
 * de plataforma — encendidos/apagados por el operador del SaaS via env
 * vars en Vercel. Sirven para esconder features que requieren
 * configuración externa (ej. credenciales Meta) hasta estar listas.
 */

/**
 * ¿Está configurado el OAuth con Meta para conectar Instagram?
 *
 * Requiere `META_APP_ID` + `META_APP_SECRET` en env. Si faltan, escondemos
 * toda la UI de IG (tab settings, botón "Publicar ahora", etc.) y mostramos
 * "Próximamente: auto-publicación".
 *
 * Permite arrancar el SaaS sin App Review de Meta — los users planean,
 * aprueban y publican manualmente en IG mientras tanto.
 */
export function isMetaOAuthConfigured(): boolean {
  return !!(process.env.META_APP_ID && process.env.META_APP_SECRET);
}

/**
 * Snapshot de todas las flags para pasar al cliente vía Provider. Solo se
 * incluyen booleans seguros de exponer (nada de secrets).
 */
export function getFeatureFlags(): {
  metaOAuthEnabled: boolean;
} {
  return {
    metaOAuthEnabled: isMetaOAuthConfigured(),
  };
}
