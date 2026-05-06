"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function SendButton({
  broadcastId,
  subject,
  audience,
}: {
  broadcastId: string;
  subject: string;
  audience: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function send() {
    if (
      !confirm(
        `Vas a enviar "${subject}" a la audiencia "${audience}".\n\nEsto puede tardar un par de minutos. ¿Confirmás?`,
      )
    )
      return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/broadcasts/${broadcastId}/send`, {
        method: "POST",
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j.error ?? "Error");
        return;
      }
      toast.success(
        `Enviado: ${j.broadcast.sentCount} OK${j.broadcast.failedCount > 0 ? `, ${j.broadcast.failedCount} fallidos` : ""}`,
      );
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
      onClick={send}
      disabled={busy}
      className="btn-gradient inline-flex items-center gap-2 rounded-md px-4 py-2 text-[13px] font-semibold disabled:opacity-50"
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Send className="h-3.5 w-3.5" />
      )}
      Enviar ahora
    </button>
  );
}
