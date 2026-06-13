import Link from "next/link";
import { Zap } from "lucide-react";

export default function PublicHeader() {
  return (
    <header className="sticky top-0 z-30 w-full glass border-b divider">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-2.5">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg brand-gradient text-white shadow-sm">
            <Zap className="h-4 w-4" strokeWidth={2.5} />
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-white">
            MarketaFlow<span className="brand-gradient-text">.</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-7 text-[13px] text-zinc-300 md:flex">
          <Link href="/#features" className="hover:text-white transition">Funciones</Link>
          <Link href="/pricing" className="hover:text-white transition">Precios</Link>
          <Link href="/blog" className="hover:text-white transition">Blog</Link>
          <Link href="/pricing#faq" className="hover:text-white transition">FAQ</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="hidden rounded-full px-4 py-1.5 text-[13px] font-medium text-zinc-300 hover:text-white sm:inline-block"
          >
            Iniciar sesión
          </Link>
          <Link
            href="/register"
            className="btn-gradient rounded-full px-4 py-1.5 text-[13px] font-semibold"
          >
            Empezar gratis
          </Link>
        </div>
      </div>
    </header>
  );
}
