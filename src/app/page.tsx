import Link from "next/link";
import { redirect } from "next/navigation";
import {
  MessageSquare,
  CalendarClock,
  CheckCircle2,
  Images,
  Bell,
  Layers,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import PublicHeader from "@/components/PublicHeader";
import PublicFooter from "@/components/PublicFooter";
import PricingTable from "@/components/PricingTable";
import Particles from "@/components/Particles";
import InteractiveFeedDemo from "@/components/InteractiveFeedDemo";

const FEATURES = [
  {
    icon: MessageSquare,
    title: "Comentarios anclados",
    body: "Tu cliente clickea sobre la imagen para dejar feedback exacto. Adiós a los audios de WhatsApp.",
    tint: "from-blue-500 to-indigo-600",
  },
  {
    icon: CheckCircle2,
    title: "Aprobación de un click",
    body: "Botón único para aprobar o pedir cambios con nota. Histórico completo y auditable.",
    tint: "from-emerald-500 to-teal-600",
  },
  {
    icon: CalendarClock,
    title: "Auto-publicación",
    body: "Conectas Instagram una vez y MarketaFlow publica solo cuando llega la fecha programada.",
    tint: "from-fuchsia-500 to-purple-600",
  },
  {
    icon: Layers,
    title: "Vista feed y calendario",
    body: "Mira el feed planeado como en tu perfil de IG, o cambia a calendario mensual.",
    tint: "from-rose-500 to-orange-500",
  },
  {
    icon: Images,
    title: "Carrusel multi-imagen",
    body: "Subes varias imágenes, las reordenas arrastrando y la portada se elige sola.",
    tint: "from-amber-500 to-orange-600",
  },
  {
    icon: Bell,
    title: "Notificaciones inteligentes",
    body: "Avisos en tiempo real al cliente cuando hay algo para revisar y a la agencia cuando aprueba.",
    tint: "from-pink-500 to-rose-600",
  },
];

export default async function Home() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <div className="flex min-h-screen flex-col bg-black">
      <PublicHeader />

      {/* HERO */}
      <section className="relative overflow-hidden">
        <Particles count={36} />
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div
            className="blob blob-a"
            style={{
              width: 620,
              height: 620,
              top: "-160px",
              left: "-180px",
              background: "radial-gradient(circle, #3b5fff 0%, transparent 65%)",
              opacity: 0.6,
            }}
          />
          <div
            className="blob blob-b"
            style={{
              width: 680,
              height: 680,
              top: "-100px",
              right: "-180px",
              background: "radial-gradient(circle, #8a2be2 0%, transparent 65%)",
              opacity: 0.6,
            }}
          />
          <div
            className="blob blob-c"
            style={{
              width: 560,
              height: 560,
              bottom: "-200px",
              right: "20%",
              background: "radial-gradient(circle, #ff4d8f 0%, transparent 65%)",
              opacity: 0.55,
            }}
          />
          {/* Glow centrado bajo el título */}
          <div
            className="absolute left-1/2 top-[260px] -z-10 h-72 w-[680px] -translate-x-1/2 rounded-full blur-3xl"
            style={{
              background:
                "radial-gradient(circle, rgba(255,77,143,0.45) 0%, rgba(138,43,226,0.30) 35%, transparent 70%)",
            }}
          />
        </div>

        <div className="relative mx-auto max-w-5xl px-6 pt-16 pb-12 text-center sm:pt-24 sm:pb-16">
          <span className="inline-flex items-center gap-2 rounded-full glass px-3.5 py-1 text-[12px] font-medium text-zinc-200">
            <span className="relative inline-flex h-1.5 w-1.5">
              <span className="absolute inset-0 animate-ping rounded-full bg-fuchsia-500/60" />
              <span className="relative inline-block h-1.5 w-1.5 rounded-full brand-gradient" />
            </span>
            Plataforma para agencias digitales
          </span>
          <h1 className="mt-6 text-5xl font-bold tracking-tight text-white sm:text-7xl">
            El fin del ping-pong de
            <br />
            <span className="brand-gradient-text-animated drop-shadow-[0_0_40px_rgba(255,77,143,0.35)]">
              WhatsApp con tu cliente
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-zinc-300 sm:text-lg">
            Sube el feed planeado, tu cliente aprueba con un click y MarketaFlow
            programa la publicación. Cero fricción, todo auditable.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/register"
              className="btn-gradient relative isolate overflow-hidden rounded-full px-7 py-3 text-[14px] font-semibold"
            >
              <span className="relative z-10">Empezar gratis</span>
              <span className="shine-overlay" />
            </Link>
            <Link
              href="/pricing"
              className="rounded-full glass px-7 py-3 text-[14px] font-semibold text-white hover:bg-white/10 transition"
            >
              Ver planes
            </Link>
          </div>
          <p className="mt-3 text-xs text-zinc-500">
            Sin tarjeta · Setup en 2 minutos
          </p>
        </div>

        {/* Feed mockup interactivo */}
        <div className="relative mx-auto max-w-3xl px-6 pb-12">
          <InteractiveFeedDemo />
        </div>

        {/* Logos / brands strip */}
        <div className="relative pb-12">
          <p className="mx-auto max-w-2xl text-center text-sm text-zinc-400">
            Publica en las plataformas que{" "}
            <span className="font-semibold text-white">ya usas</span> con tus clientes.
          </p>
          <div className="mx-auto mt-4 flex max-w-3xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-6 text-zinc-300">
            <BrandLabel name="Instagram" />
            <BrandLabel name="Facebook" />
            <BrandLabel name="TikTok" />
            <BrandLabel name="Meta Ads" />
            <BrandLabel name="LinkedIn" />
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="border-t divider bg-[#06060a]">
        <div className="mx-auto w-full max-w-6xl px-6 py-20">
          <div className="text-center">
            <p className="text-[11px] font-semibold uppercase tracking-widest brand-gradient-text">
              Todo en un solo lugar
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-5xl">
              Diseñado para agencias.
              <br />
              <span className="text-zinc-500">Hecho para escalar.</span>
            </h2>
          </div>
          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="card group relative overflow-hidden p-6 transition hover:-translate-y-0.5 hover:border-white/15"
                >
                  <span
                    aria-hidden
                    className={`pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-gradient-to-br ${f.tint} opacity-15 blur-2xl transition-opacity duration-300 group-hover:opacity-40`}
                  />
                  <span
                    className={`relative grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br ${f.tint} text-white shadow-lg`}
                    style={{ boxShadow: "0 8px 24px -8px rgba(255,77,143,0.5)" }}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="relative mt-5 text-base font-semibold tracking-tight text-white">
                    {f.title}
                  </h3>
                  <p className="relative mt-1.5 text-[14px] text-zinc-400">{f.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="border-t divider bg-black">
        <div className="mx-auto w-full max-w-6xl px-6 py-20">
          <div className="text-center">
            <p className="text-[11px] font-semibold uppercase tracking-widest brand-gradient-text">
              Planes
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-5xl">
              Empieza gratis.
              <br />
              <span className="text-zinc-500">Crece sin sorpresas.</span>
            </h2>
          </div>
          <div className="mt-14">
            <PricingTable />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden border-t divider bg-[#06060a]">
        <Particles count={20} />
        <div className="relative mx-auto w-full max-w-3xl px-6 py-20 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-5xl">
            Deja de aprobar posts
            <br />
            <span className="brand-gradient-text">por WhatsApp.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg text-zinc-400">
            Crea tu cuenta gratis y migra tu primer cliente en 5 minutos.
          </p>
          <Link
            href="/register"
            className="btn-gradient mt-9 inline-block rounded-full px-7 py-3.5 text-[14px] font-semibold"
          >
            Empezar ahora
          </Link>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}

function BrandLabel({ name }: { name: string }) {
  return (
    <span className="text-base font-semibold tracking-tight text-zinc-400 sm:text-lg">
      {name}
    </span>
  );
}
