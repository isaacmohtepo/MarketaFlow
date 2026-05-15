import { requireBillingShell } from "@/lib/billing-shell";
import BillingTabs from "./BillingTabs";

/**
 * Layout compartido para todas las rutas /billing/*.
 *
 * SEGÚN NEXT.JS APP ROUTER: el layout NO se re-renderiza al navegar
 * entre páginas hijas — solo el `{children}` cambia. Eso significa
 * que el header + tabs se renderizan UNA SOLA VEZ y persisten entre
 * navegaciones:
 *
 *   /billing/plan → /billing/productos
 *
 * El header "Facturación / agency name" y los tabs no parpadean ni se
 * re-renderizan; solo el contenido del page swap-in. Sensación SPA
 * reactiva — antes cada página renderizaba todo de cero.
 *
 * El user title (Resumen / Plan / Productos / etc.) vive dentro de
 * cada page hijo porque es lo único que cambia.
 */
export default async function BillingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const shell = await requireBillingShell();
  // Si no hay owner, dejamos que el page hijo renderice su placeholder
  // (cada page ya tiene su <NoOwner /> fallback que el shell también
  // resuelve internamente). El layout solo aporta el header cuando hay
  // shell ok.
  const agencyName = shell.ok ? shell.agency.name : null;

  return (
    <div className="mx-auto max-w-5xl">
      {/* Header persistente: H1 + agency name. No se re-renderiza entre
          navegaciones de tabs — solo el {children} de abajo cambia.
          Print: oculto, porque la factura imprimible (sub-page hijo) tiene
          su propio header de documento. */}
      {agencyName && (
        <div className="mb-2 print:hidden">
          <h1 className="text-[28px] font-bold tracking-tight text-zinc-900">
            Facturación
          </h1>
          <p className="mt-1 text-[13px] text-zinc-500">{agencyName}</p>
        </div>
      )}
      {/* Tabs persistentes — se mantienen montados, solo cambia el
          highlight del activo via usePathname. */}
      <BillingTabs />
      {/* Contenido específico de cada page */}
      {children}
    </div>
  );
}
