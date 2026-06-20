import Link from "next/link";
import { ArrowRight, Mail } from "lucide-react";

/**
 * Footer público (marketing + blog). Se usa en home, pricing, blog y share.
 */
export default function PublicFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="relative overflow-hidden border-t divider bg-black">
      {/* Línea de acento + glow sutil bajo el footer */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-fuchsia-500/40 to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 left-1/2 h-72 w-[620px] -translate-x-1/2 rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(138,43,226,0.12) 0%, transparent 70%)",
        }}
      />

      <div className="relative mx-auto grid max-w-6xl gap-10 px-6 py-14 sm:grid-cols-12">
        {/* Marca + CTA */}
        <div className="sm:col-span-5">
          <p className="text-lg font-semibold text-white">
            MarketaFlow<span className="brand-gradient-text">.</span>
          </p>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-zinc-400">
            Aprobación de contenido y gestión de tareas para agencias digitales.
            Cero ping-pong de WhatsApp, todo en tiempo real.
          </p>
          <Link
            href="/register"
            className="btn-gradient mt-5 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold"
          >
            Empezar gratis
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Producto */}
        <nav className="sm:col-span-3" aria-label="Producto">
          <p className="text-2xs font-semibold uppercase tracking-wider text-zinc-500">
            Producto
          </p>
          <ul className="mt-4 space-y-2.5 text-sm text-zinc-300">
            <li><Link href="/#features" className="transition hover:text-white">Funciones</Link></li>
            <li><Link href="/pricing" className="transition hover:text-white">Precios</Link></li>
            <li><Link href="/blog" className="transition hover:text-white">Blog</Link></li>
            <li><Link href="/register" className="transition hover:text-white">Crear cuenta</Link></li>
            <li><Link href="/login" className="transition hover:text-white">Iniciar sesión</Link></li>
          </ul>
        </nav>

        {/* Contacto + legal */}
        <div className="sm:col-span-4">
          <p className="text-2xs font-semibold uppercase tracking-wider text-zinc-500">
            Contacto
          </p>
          <ul className="mt-4 space-y-2.5 text-sm text-zinc-300">
            <li>
              <a
                href="mailto:hola@marketaflow.com"
                className="inline-flex items-center gap-1.5 transition hover:text-white"
              >
                <Mail className="h-3.5 w-3.5" />
                hola@marketaflow.com
              </a>
            </li>
            <li><Link href="/terminos" className="transition hover:text-white">Términos y condiciones</Link></li>
            <li><Link href="/privacidad" className="transition hover:text-white">Política de privacidad</Link></li>
          </ul>
        </div>
      </div>

      <div className="relative border-t divider">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-6 py-5 text-xs text-zinc-500 sm:flex-row">
          <p>© {year} MarketaFlow. Hecho para agencias.</p>
          <p className="text-zinc-600">
            Aprobación sin caos · Tareas en tiempo real
          </p>
        </div>
      </div>
    </footer>
  );
}
