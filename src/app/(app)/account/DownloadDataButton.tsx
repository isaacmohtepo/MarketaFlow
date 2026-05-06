"use client";

import { Download } from "lucide-react";

export default function DownloadDataButton() {
  return (
    <a
      href="/api/account/export"
      className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-2 text-[12.5px] font-semibold text-zinc-700 hover:bg-zinc-50"
    >
      <Download className="h-3.5 w-3.5" />
      Descargar JSON
    </a>
  );
}
