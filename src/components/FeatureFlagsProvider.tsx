"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Provider client-side para feature flags globales del SaaS.
 *
 * El layout server computa `getFeatureFlags()` desde env y los inyecta aquí.
 * Componentes client usan `useFeatureFlags()` para esconder UI de features
 * deshabilitadas. Default: todos en false (deny-by-default si no hay
 * provider, ej. en páginas públicas).
 */

type Flags = {
  /** ¿Conectar Instagram via OAuth está habilitado? Requiere META_APP_ID. */
  metaOAuthEnabled: boolean;
};

const DEFAULT_FLAGS: Flags = {
  metaOAuthEnabled: false,
};

const Ctx = createContext<Flags>(DEFAULT_FLAGS);

export function FeatureFlagsProvider({
  flags,
  children,
}: {
  flags: Flags;
  children: ReactNode;
}) {
  return <Ctx.Provider value={flags}>{children}</Ctx.Provider>;
}

export function useFeatureFlags(): Flags {
  return useContext(Ctx);
}
