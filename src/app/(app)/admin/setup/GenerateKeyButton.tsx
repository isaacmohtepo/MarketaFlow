"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, KeyRound } from "lucide-react";
import { toast } from "sonner";

export default function GenerateKeyButton() {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function generate() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/setup", { method: "POST" });
      const j = await res.json();
      if (!res.ok) {
        toast.error("No se pudo generar", { description: j.error });
        return;
      }
      toast.success("Master key generada y guardada", {
        description: "Ya puedes configurar pasarelas de pago.",
      });
      router.refresh();
    } catch {
      toast.error("Error de red");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={generate}
      disabled={busy}
      className="btn-gradient inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-[13px] font-semibold disabled:opacity-50"
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <KeyRound className="h-3.5 w-3.5" />
      )}
      Generar master key
    </button>
  );
}
