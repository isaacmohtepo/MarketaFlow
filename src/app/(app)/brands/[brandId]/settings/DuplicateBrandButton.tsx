"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmDialog";

/**
 * Botón "Duplicar marca" — crea una nueva marca con el mismo color/bio/logo,
 * hashtag sets y plantillas de la origen. NO copia posts ni miembros.
 * Pensado para onboardear clientes nuevos con setup similar.
 */
export default function DuplicateBrandButton({
  brandId,
  brandName,
}: {
  brandId: string;
  brandName: string;
}) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const { confirm: confirmDialog } = useConfirm();

  async function duplicate() {
    const ok = await confirmDialog({
      title: `¿Duplicar "${brandName}"?`,
      description:
        "Se creará una nueva marca con el mismo color, bio, logo, hashtags y plantillas. Los posts, comentarios y miembros NO se copian.",
      confirmLabel: "Duplicar",
      cancelLabel: "Cancelar",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/brands/${brandId}/duplicate`, { method: "POST" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error("No se pudo duplicar", { description: j.error ?? res.statusText });
        return;
      }
      const j = await res.json();
      toast.success("Marca duplicada", {
        description: "Te llevamos a la nueva marca para que ajustes lo que necesites.",
      });
      router.push(`/brands/${j.id}/settings`);
      router.refresh();
    } catch {
      toast.error("Error de red");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={duplicate}
      disabled={busy}
      className="inline-flex items-center gap-2 rounded-md btn-secondary px-3 py-2 text-[12px] font-semibold disabled:opacity-60"
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
      Duplicar marca
    </button>
  );
}
