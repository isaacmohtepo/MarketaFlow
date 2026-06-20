import type { ReactNode } from "react";
import PublicHeader from "./PublicHeader";
import PublicFooter from "./PublicFooter";

/**
 * Layout compartido para páginas legales (Términos, Privacidad). Mantiene el
 * theme oscuro del sitio público y una columna de lectura cómoda. El cuerpo se
 * arma con los helpers `LegalH2` / `LegalP` / `LegalUL` para un estilo uniforme.
 */
export default function LegalShell({
  eyebrow = "Legal",
  title,
  updated,
  intro,
  children,
}: {
  eyebrow?: string;
  title: string;
  updated: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <div className="theme-dark flex min-h-screen flex-col bg-black">
      <PublicHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16 sm:py-20">
        <p className="text-2xs font-semibold uppercase tracking-widest brand-gradient-text">
          {eyebrow}
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
          {title}
        </h1>
        <p className="mt-3 text-xs text-zinc-500">
          Última actualización: {updated}
        </p>
        {intro ? (
          <p className="mt-6 text-base leading-relaxed text-zinc-300">{intro}</p>
        ) : null}
        <div className="mt-10">{children}</div>
      </main>
      <PublicFooter />
    </div>
  );
}

export function LegalH2({ children }: { children: ReactNode }) {
  return (
    <h2 className="mt-10 text-lg font-semibold tracking-tight text-white">
      {children}
    </h2>
  );
}

export function LegalP({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 text-[14px] leading-relaxed text-zinc-400">{children}</p>
  );
}

export function LegalUL({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[14px] leading-relaxed text-zinc-400 marker:text-zinc-600">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}
