"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, AlertCircle } from "lucide-react";

/**
 * Mientras se crea el payment link en Wompi, mostramos un loader. Cuando
 * llega la URL, redirigimos automáticamente.
 */
export default function CheckoutClient({
  plan,
  cycle,
  agencyId,
}: {
  plan: "pro" | "agency";
  cycle: "monthly" | "yearly";
  agencyId?: string;
}) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planId: plan, cycle, agencyId }),
        });
        const j = await res.json();
        if (cancelled) return;
        if (!res.ok || !j.checkoutUrl) {
          setError(j.error ?? "No se pudo iniciar el pago.");
          return;
        }
        // Redirect al checkout hosted de Wompi
        window.location.href = j.checkoutUrl;
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Error de red al iniciar el pago",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [plan, cycle, agencyId]);

  return (
    <div className="mx-auto max-w-md py-20 text-center">
      {error ? (
        <>
          <AlertCircle className="mx-auto h-12 w-12 text-rose-500" />
          <h1 className="mt-4 text-2xl font-bold text-zinc-900">No pudimos iniciar el pago</h1>
          <p className="mt-2 text-sm text-zinc-500">{error}</p>
          <Link
            href="/billing"
            className="btn-secondary mt-6 inline-block rounded-full px-6 py-2.5 text-[13px] font-semibold"
          >
            Volver
          </Link>
        </>
      ) : (
        <>
          <Loader2 className="mx-auto h-12 w-12 animate-spin text-fuchsia-500" />
          <h1 className="mt-4 text-2xl font-bold text-zinc-900">
            Redirigiendo a Wompi…
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            En un instante vas a poder elegir el método de pago (tarjeta, PSE,
            Nequi, Daviplata).
          </p>
        </>
      )}
    </div>
  );
}
