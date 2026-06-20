"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import { hasAnalyticsConsent, COOKIE_CONSENT_EVENT } from "@/lib/cookie-consent";

/**
 * Google Analytics 4 — se carga SOLO si (1) existe NEXT_PUBLIC_GA_ID y (2) el
 * usuario aceptó las cookies no esenciales (banner de consentimiento). Sin
 * consentimiento no se inyecta ningún script (cero tracking por defecto).
 *
 * Para activarlo: crear una propiedad GA4, copiar el "Measurement ID"
 * (G-XXXXXXXXXX) y setear NEXT_PUBLIC_GA_ID en Vercel.
 *
 * Reacciona al evento de consentimiento, así GA carga apenas el usuario
 * acepta, sin recargar la página.
 */
export default function Analytics() {
  const gaId = process.env.NEXT_PUBLIC_GA_ID;
  const [consented, setConsented] = useState(false);

  useEffect(() => {
    setConsented(hasAnalyticsConsent());
    const onConsent = () => setConsented(hasAnalyticsConsent());
    window.addEventListener(COOKIE_CONSENT_EVENT, onConsent);
    return () => window.removeEventListener(COOKIE_CONSENT_EVENT, onConsent);
  }, []);

  if (!gaId || !consented) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${gaId}', { anonymize_ip: true });
        `}
      </Script>
    </>
  );
}
