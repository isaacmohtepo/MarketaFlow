import Link from "next/link";
import { redirect } from "next/navigation";
import {
  MessageSquare,
  CheckCircle2,
  Video,
  Bell,
  Layers,
  CheckSquare,
  Zap,
  LayoutGrid,
  BarChart3,
  ArrowRight,
  Clock,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getAllArticles, formatArticleDate } from "@/lib/blog";
import PublicHeader from "@/components/PublicHeader";
import PublicFooter from "@/components/PublicFooter";
import PricingTable from "@/components/PricingTable";
import Particles from "@/components/Particles";
import InteractiveFeedDemo from "@/components/InteractiveFeedDemo";
import JsonLd from "@/components/JsonLd";
import { landingGraph } from "@/lib/structured-data";
import type { Metadata } from "next";

// La home se queda con el title/description por defecto del layout; solo
// fijamos su canonical propio (la raíz del sitio).
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const FEATURES = [
  {
    icon: MessageSquare,
    title: "Comentarios anclados",
    body: "Tu cliente clickea sobre la imagen —o el segundo exacto del video— para dejar feedback preciso. Adiós a los audios de WhatsApp.",
    tint: "from-blue-500 to-indigo-600",
  },
  {
    icon: CheckCircle2,
    title: "Aprobación de un click",
    body: "Botón único para aprobar o pedir cambios con nota. Historial completo y auditable de cada decisión.",
    tint: "from-emerald-500 to-teal-600",
  },
  {
    icon: CheckSquare,
    title: "Tablero de tareas del equipo",
    body: "Organiza el trabajo como en Linear o Asana, dentro de tu agencia: columnas, prioridades, vencimientos, asignados, subtareas y comentarios.",
    tint: "from-fuchsia-500 to-purple-600",
  },
  {
    icon: Zap,
    title: "Todo en tiempo real",
    body: "Cambios, comentarios y tareas se sincronizan al instante para todo el equipo. Ves quién está viendo cada cosa, sin recargar.",
    tint: "from-amber-500 to-orange-600",
  },
  {
    icon: Video,
    title: "Video y diseño web también",
    body: "No solo posts: revisa reels con comentarios anclados al segundo, y sitios web con feedback sobre el diseño en vivo.",
    tint: "from-rose-500 to-pink-600",
  },
  {
    icon: Layers,
    title: "Feed planeado como en IG",
    body: "Mira el feed completo como va a quedar en el perfil antes de publicar. Reordenas los posts arrastrando.",
    tint: "from-pink-500 to-rose-600",
  },
  {
    icon: LayoutGrid,
    title: "Varios espacios de trabajo",
    body: "Gestiona varias agencias o equipos desde una sola cuenta y cambia entre ellos con un click. Cada espacio con su propio plan.",
    tint: "from-cyan-500 to-blue-600",
  },
  {
    icon: BarChart3,
    title: "Dashboard con métricas",
    body: "Analytics de posts, aprobaciones y tendencias en gráficos. Conoce cómo va cada cliente y tu equipo de un vistazo.",
    tint: "from-violet-500 to-indigo-600",
  },
  {
    icon: Bell,
    title: "Notificaciones e inbox",
    body: "Asignaciones, menciones, aprobaciones y vencimientos — todo lo que necesita tu atención, en un inbox claro y en tiempo real.",
    tint: "from-rose-500 to-orange-500",
  },
];

export default async function Home() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  const latestArticles = getAllArticles().slice(0, 3);

  return (
    <div className="theme-dark flex min-h-screen flex-col bg-black">
      <JsonLd data={landingGraph()} />
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
            El sistema operativo de tu agencia
          </span>
          <h1 className="mt-6 text-5xl font-bold tracking-tight text-white sm:text-7xl">
            Contenido, tareas y equipo.
            <br />
            <span className="brand-gradient-text-animated drop-shadow-[0_0_40px_rgba(255,77,143,0.35)]">
              Todo en un solo lugar.
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-zinc-300 sm:text-lg">
            Tu cliente aprueba el contenido con un click, tu equipo organiza las
            tareas y tú ves todo en tiempo real. Sin fricción, sin WhatsApp y
            100% auditable.
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

        {/* Tipos de contenido que se revisan */}
        <div className="relative pb-12">
          <p className="mx-auto max-w-2xl text-center text-sm text-zinc-400">
            Revisa y aprueba{" "}
            <span className="font-semibold text-white">cualquier entregable</span>{" "}
            con tu cliente.
          </p>
          <div className="mx-auto mt-4 flex max-w-3xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-6 text-zinc-300">
            <BrandLabel name="Posts de Instagram" />
            <BrandLabel name="Videos / Reels" />
            <BrandLabel name="Diseño web" />
            <BrandLabel name="Piezas gráficas" />
          </div>
        </div>
      </section>

      {/* CÓMO FUNCIONA — 3 pasos */}
      <section className="border-t divider bg-black">
        <div className="mx-auto w-full max-w-6xl px-6 py-20">
          <div className="text-center">
            <p className="text-2xs font-semibold uppercase tracking-widest brand-gradient-text">
              Cómo funciona
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-5xl">
              De idea a aprobado
              <br />
              <span className="text-zinc-500">en 3 pasos.</span>
            </h2>
          </div>
          <div className="mt-14 grid gap-4 sm:grid-cols-3">
            {[
              {
                n: "01",
                title: "Subes el feed planeado",
                body: "Cargas los posts del mes — imágenes, carruseles, reels, captions. Reordenas arrastrando y ves cómo queda el feed como en IG.",
              },
              {
                n: "02",
                title: "Tu cliente aprueba",
                body: "Le mandas el link. Comenta clickeando sobre la imagen, aprueba o pide cambios con un click. Sin WhatsApp, sin audios, todo auditable.",
              },
              {
                n: "03",
                title: "Listo para publicar",
                body: "Cuando el cliente aprueba, descargas la pieza final y el caption listos para subir a Instagram. Sin malentendidos, con todo el historial guardado.",
              },
            ].map((step, i) => (
              <div
                key={step.n}
                className="card relative overflow-hidden p-6"
              >
                <span className="brand-gradient-text text-4xl font-black tracking-tight opacity-90">
                  {step.n}
                </span>
                {i < 2 && (
                  <span
                    aria-hidden
                    className="absolute right-5 top-7 hidden text-zinc-700 sm:block"
                  >
                    →
                  </span>
                )}
                <h3 className="mt-3 text-base font-semibold tracking-tight text-white">
                  {step.title}
                </h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-zinc-400">
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="border-t divider bg-[#06060a]">
        <div className="mx-auto w-full max-w-6xl px-6 py-20">
          <div className="text-center">
            <p className="text-2xs font-semibold uppercase tracking-widest brand-gradient-text">
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
            <p className="text-2xs font-semibold uppercase tracking-widest brand-gradient-text">
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

      {/* BLOG */}
      <section className="border-t divider bg-[#06060a]">
        <div className="mx-auto w-full max-w-6xl px-6 py-20">
          <div className="flex flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-left">
            <div>
              <p className="text-2xs font-semibold uppercase tracking-widest brand-gradient-text">
                Del blog
              </p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Aprende a escalar tu agencia.
              </h2>
            </div>
            <Link
              href="/blog"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full glass px-5 py-2.5 text-[13px] font-semibold text-white transition hover:bg-white/10"
            >
              Ver todos los artículos
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            {latestArticles.map((a) => (
              <Link
                key={a.slug}
                href={`/blog/${a.slug}`}
                className="card group relative flex flex-col overflow-hidden p-6 transition hover:-translate-y-0.5 hover:border-white/15"
              >
                <span className="inline-flex w-fit items-center rounded-full bg-white/[0.06] px-2.5 py-1 text-3xs font-semibold uppercase tracking-wide text-fuchsia-300 ring-1 ring-white/10">
                  {a.category}
                </span>
                <h3 className="mt-3 text-lg font-bold leading-snug tracking-tight text-white">
                  {a.title}
                </h3>
                <p className="mt-2 flex-1 text-[14px] leading-relaxed text-zinc-400 line-clamp-3">
                  {a.description}
                </p>
                <div className="mt-4 flex items-center justify-between text-xs text-zinc-500">
                  <span className="flex items-center gap-3">
                    <span>{formatArticleDate(a.date)}</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {a.readingMinutes} min
                    </span>
                  </span>
                  <span className="flex items-center gap-1 font-medium text-fuchsia-300 transition group-hover:gap-2">
                    Leer
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden border-t divider bg-black">
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
