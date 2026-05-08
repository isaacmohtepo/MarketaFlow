"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmDialog";

/**
 * Botón danger zone para eliminar permanentemente una marca. Pide
 * confirmar tipeando el nombre exacto, así no hay accidentes.
 */
export default function DeleteBrandButton({
  brandId,
  brandName,
}: {
  brandId: string;
  brandName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const { confirm } = useConfirm();

  async function handleDelete() {
    const ok = await confirm({
      title: `¿Eliminar la marca "${brandName}"?`,
      description:
        "Se borran todos los posts, comentarios, plantillas, hashtag sets, links públicos e historial. Los clientes invitados pierden acceso. NO se puede deshacer.",
      confirmLabel: "Continuar",
      cancelLabel: "Cancelar",
      variant: "danger",
    });
    if (!ok) return;

    // Doble confirm: pedir tipear el nombre exacto vía browser prompt.
    const typed = window.prompt(
      `Para confirmar, tipeá exactamente: ${brandName}`,
    );
    if (typed === null) return;
    if (typed.trim() !== brandName) {
      toast.error("El nombre no coincide. La marca NO se eliminó.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/brands/${brandId}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j.error ?? "No se pudo eliminar la marca");
        return;
      }
      toast.success(`Marca "${brandName}" eliminada`);
      router.push("/brands");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-md bg-rose-600 px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60"
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Trash2 className="h-3.5 w-3.5" />
      )}
      Eliminar marca permanentemente
    </button>
  );
}
