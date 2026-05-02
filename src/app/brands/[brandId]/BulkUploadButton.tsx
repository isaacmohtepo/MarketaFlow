"use client";

import { useState } from "react";
import { UploadCloud } from "lucide-react";
import BulkUploadModal from "./BulkUploadModal";

export default function BulkUploadButton({ brandId }: { brandId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full btn-secondary px-3 py-2 text-[13px] font-semibold sm:px-3.5"
        title="Subir varias imágenes de una vez"
      >
        <UploadCloud className="h-4 w-4" />
        <span className="hidden sm:inline">Subir varios</span>
      </button>
      {open && <BulkUploadModal brandId={brandId} onClose={() => setOpen(false)} />}
    </>
  );
}
