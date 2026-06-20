"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Cookie } from "lucide-react";
import { getConsent, setConsent } from "@/lib/cookie-consent";

/**
 * Banner de consentimiento de cookies. Aparece abajo solo si el usuario aún
 * no decidió. Estilo oscuro autocontenido para que se lea bien tanto en las
 * páginas públicas (theme oscuro) como dentro de la app (theme claro).
 *
 * "Aceptar" habilita la analítica (GA4 escucha el evento y carga al instante).
 * "Solo esenciales" la rechaza. La decisión se guarda en localStorage.
 */
export default function CookieConsent() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Solo mostrar si no hay decisión previa. En SSR no se renderiza (evita
    // flash); aparece tras montar en cliente.
    if (getConsent() === null) setShow(true);
  }, []);

  if (!show) return null;

  function decide(value: "accepted" | "rejected") {
    setConsent(value);
    setShow(false);
  }

  return (
    <div
      role="dialog"
      aria-label="Aviso de cookies"
      className="fixed inset-x-3 bottom-3 z-[80] mx-auto max-w-lg rounded-xl border border-white/10 bg-zinc-900/95 p-4 text-zinc-200 shadow-2xl backdrop-blur sm:inset-x-auto sm:left-4"
    >
      <div className="flex items-start gap-3">
        <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-white/10 text-fuchsia-300">
          <Cookie className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-white">
            Usamos cookies
          </p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-400">
            Las esenciales mantienen tu sesión. Con tu permiso, usamos
            analítica para mejorar el producto. Podés cambiar de opinión cuando
            quieras.{" "}
            <Link
              href="/privacidad"
              className="font-medium text-fuchsia-300 underline-offset-2 hover:underline"
            >
              Más info
            </Link>
            .
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => decide("accepted")}
              className="btn-gradient rounded-md px-3.5 py-1.5 text-xs font-semibold text-white"
            >
              Aceptar
            </button>
            <button
              onClick={() => decide("rejected")}
              className="rounded-md border border-white/15 px-3.5 py-1.5 text-xs font-semibold text-zinc-200 transition hover:bg-white/10"
            >
              Solo esenciales
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
