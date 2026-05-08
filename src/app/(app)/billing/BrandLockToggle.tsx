"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Unlock, Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Toggle para pausar/reactivar una marca cuando la agencia excede el
 * límite del plan. Si trying to unlock and limit ya alcanzado, el
 * backend devuelve 402 con mensaje claro.
 */
export default function BrandLockToggle({
  brandId,
  locked,
}: {
  brandId: string;
  locked: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      const res = await fetch(`/api/brands/${brandId}/lock`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locked: !locked }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j.error ?? "No se pudo cambiar el estado");
        return;
      }
      toast.success(locked ? "Marca reactivada" : "Marca pausada");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-[11.5px] font-semibold transition disabled:opacity-60 ${
        locked
          ? "bg-emerald-600 text-white hover:bg-emerald-700"
          : "bg-amber-100 text-amber-800 ring-1 ring-amber-200 hover:bg-amber-200"
      }`}
    >
      {busy ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : locked ? (
        <Unlock className="h-3 w-3" />
      ) : (
        <Lock className="h-3 w-3" />
      )}
      {locked ? "Reactivar" : "Pausar"}
    </button>
  );
}
