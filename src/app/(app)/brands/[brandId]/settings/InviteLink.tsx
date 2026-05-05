"use client";

import { useState } from "react";

export default function InviteLink({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" ? `${window.location.origin}/invite/${code}` : `/invite/${code}`;
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <input
        readOnly
        value={url}
        className="flex-1 rounded-lg input-soft px-3 py-2 text-sm text-zinc-600"
      />
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="btn-secondary rounded-lg px-5 py-2 text-sm font-semibold"
      >
        {copied ? "¡Copiado!" : "Copiar"}
      </button>
    </div>
  );
}
