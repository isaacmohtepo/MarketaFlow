import Link from "next/link";
import { Ban, ArrowRight } from "lucide-react";

/**
 * Banner sticky que se muestra a todos los miembros de una agency
 * suspendida. Visualmente urgente (rojo) para que entiendan el estado
 * read-only.
 */
export default function SuspendedBanner({
  agencyName,
  reason,
  isOwner,
}: {
  agencyName: string;
  reason: string | null;
  isOwner: boolean;
}) {
  return (
    <div className="sticky top-0 z-30 border-b border-rose-300/60 bg-gradient-to-r from-rose-50 via-rose-100/80 to-amber-50 px-4 py-2.5">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3">
        <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-rose-500 text-white">
          <Ban className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-semibold text-rose-900">
            <strong>{agencyName}</strong> está en modo solo-lectura
          </p>
          <p className="mt-0.5 text-[11px] text-rose-700">
            {reason
              ? `Motivo: ${reason}.`
              : "No puedes crear ni editar contenido."}{" "}
            {isOwner
              ? "Resuelve en facturación o contacta soporte."
              : "Contacta al owner de la agencia."}
          </p>
        </div>
        {isOwner && (
          <Link
            href="/billing"
            className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-rose-600 px-3 py-1 text-[11.5px] font-semibold text-white hover:bg-rose-700"
          >
            Ir a facturación
            <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>
    </div>
  );
}
