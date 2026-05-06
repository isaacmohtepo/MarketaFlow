"use client";

import { useUpgrade } from "@/components/UpgradeProvider";

/**
 * Hook que devuelve un wrapper de fetch que detecta respuestas 402 (Payment
 * Required) y abre automáticamente el modal de upgrade. Para todo lo demás,
 * se comporta como fetch normal — el caller maneja .ok / status codes como
 * siempre.
 *
 * Si el status es 402, devuelve `null` después de mostrar el modal — esto
 * señaliza al caller que NO siga procesando (el modal ya manejó el flow).
 *
 * Uso:
 *   const apiFetch = useApiFetch();
 *   const res = await apiFetch("/api/brands", { method: "POST", body: ... });
 *   if (!res) return; // upgrade modal abierto
 *   if (!res.ok) toast.error(...);
 */
export function useApiFetch() {
  const { showUpgrade } = useUpgrade();

  return async function apiFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response | null> {
    const res = await fetch(input, init);
    if (res.status === 402) {
      // Clonamos antes de leer para que el caller no pierda la response si
      // quiere inspeccionarla (por si decidimos retornar res en el futuro)
      const clone = res.clone();
      try {
        const j = (await clone.json()) as {
          error?: string;
          currentCount?: number;
          limit?: number;
          suggestedPlan?: "pro" | "agency";
        };
        showUpgrade({
          reason: j.error ?? "Llegaste al límite de tu plan.",
          suggestedPlan: j.suggestedPlan ?? "pro",
          currentCount: j.currentCount,
          limit: j.limit,
        });
      } catch {
        showUpgrade({
          reason: "Llegaste al límite de tu plan.",
          suggestedPlan: "pro",
        });
      }
      return null;
    }
    return res;
  };
}
