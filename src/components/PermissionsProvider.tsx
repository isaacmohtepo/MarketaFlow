"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Provider client-side con los permisos efectivos del user en su agency.
 *
 * El layout server-side computa los permisos via getUserPermissions() y los
 * pasa como prop. Después cualquier client component puede usar:
 *
 *   const { has } = usePermissions();
 *   if (!has("posts.publish")) return null;
 *
 * O el componente declarativo:
 *
 *   <Gated perm="brands.create"><CreateButton /></Gated>
 *
 * Para gates brand-scoped (un user puede ser CM solo en ciertas brands),
 * el provider acepta `brandPermissions` map { [brandId]: string[] }. Pasá
 * `brandId` al hook/Gated y se chequea brand-scoped + agency-wide.
 */

type PermissionsContextValue = {
  /** Permisos agency-wide (todas las memberships con brandId=null). */
  agencyPermissions: Set<string>;
  /** Permisos por brand específica (memberships brand-scoped). */
  brandPermissions: Map<string, Set<string>>;
  /** ¿Tiene el permiso? Si pasás brandId, suma los brand-scoped. */
  has: (perm: string, brandId?: string | null) => boolean;
  /** Roles del user (agency-wide), para mostrar badges/labels. */
  roles: readonly string[];
};

const Ctx = createContext<PermissionsContextValue | null>(null);

export function PermissionsProvider({
  agencyPermissions,
  brandPermissions,
  roles,
  children,
}: {
  agencyPermissions: readonly string[];
  brandPermissions: Record<string, readonly string[]>;
  roles: readonly string[];
  children: ReactNode;
}) {
  const agencySet = new Set(agencyPermissions);
  const brandMap = new Map<string, Set<string>>();
  for (const [bid, perms] of Object.entries(brandPermissions)) {
    brandMap.set(bid, new Set(perms));
  }

  const has = (perm: string, brandId?: string | null): boolean => {
    if (agencySet.has(perm)) return true;
    if (brandId) {
      const bset = brandMap.get(brandId);
      if (bset?.has(perm)) return true;
    }
    return false;
  };

  return (
    <Ctx.Provider
      value={{
        agencyPermissions: agencySet,
        brandPermissions: brandMap,
        has,
        roles,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function usePermissions(): PermissionsContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Fallback seguro: si por alguna razón no hay provider (por ej. en
    // páginas públicas o en tests), devolvemos un objeto deny-all en vez
    // de tirar. Mejor "no muestra el botón" que "explota la página".
    return {
      agencyPermissions: new Set(),
      brandPermissions: new Map(),
      has: () => false,
      roles: [],
    };
  }
  return ctx;
}

/**
 * Componente declarativo. Renderiza children solo si el user tiene `perm`.
 * Si no, renderiza `fallback` (default: nada).
 */
export function Gated({
  perm,
  brandId,
  children,
  fallback = null,
}: {
  perm: string;
  brandId?: string | null;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { has } = usePermissions();
  return has(perm, brandId) ? <>{children}</> : <>{fallback}</>;
}
