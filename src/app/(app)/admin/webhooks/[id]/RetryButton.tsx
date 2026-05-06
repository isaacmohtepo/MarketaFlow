"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCw, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function RetryButton({ webhookId }: { webhookId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function retry() {
    if (!confirm("Re-procesar este webhook? Si era un transaction.updated, va a re-aplicar el resultado al invoice.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/webhooks/${webhookId}/retry`, {
        method: "POST",
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j.error ?? "Error");
        return;
      }
      toast.success("Re-procesado OK");
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
      onClick={retry}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
      Re-procesar
    </button>
  );
}
