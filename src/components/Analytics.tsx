import Script from "next/script";

/**
 * Google Analytics 4 — se carga ÚNICAMENTE si existe NEXT_PUBLIC_GA_ID.
 * Sin esa variable no se inyecta ningún script (cero tracking por defecto).
 *
 * Para activarlo: crear una propiedad GA4, copiar el "Measurement ID"
 * (formato G-XXXXXXXXXX) y setear NEXT_PUBLIC_GA_ID en Vercel. Listo.
 *
 * Carga con strategy afterInteractive (no bloquea el render) y con IP
 * anonimizada.
 */
export default function Analytics() {
  const gaId = process.env.NEXT_PUBLIC_GA_ID;
  if (!gaId) return null;

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
