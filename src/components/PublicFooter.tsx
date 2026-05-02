import Link from "next/link";

export default function PublicFooter() {
  return (
    <footer className="border-t divider bg-black">
      <div className="mx-auto grid max-w-6xl gap-8 px-6 py-12 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <p className="text-base font-semibold text-white">
            MarketaFlow<span className="brand-gradient-text">.</span>
          </p>
          <p className="mt-2 text-sm text-zinc-400">
            Aprobación de contenido sin caos. Para agencias digitales que
            quieren cero ping-pong de WhatsApp y publicación sin fricción.
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Producto</p>
          <ul className="mt-3 space-y-1.5 text-sm text-zinc-300">
            <li><Link href="/#features" className="hover:text-white">Funciones</Link></li>
            <li><Link href="/pricing" className="hover:text-white">Precios</Link></li>
            <li><Link href="/login" className="hover:text-white">Iniciar sesión</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Empresa</p>
          <ul className="mt-3 space-y-1.5 text-sm text-zinc-300">
            <li><span>Contacto</span></li>
            <li><span>Soporte</span></li>
            <li><span>Términos</span></li>
          </ul>
        </div>
      </div>
      <div className="border-t divider px-6 py-4 text-center text-xs text-zinc-500">
        © {new Date().getFullYear()} MarketaFlow. Hecho para agencias.
      </div>
    </footer>
  );
}
