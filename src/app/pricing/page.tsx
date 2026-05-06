import PublicHeader from "@/components/PublicHeader";
import PublicFooter from "@/components/PublicFooter";
import PricingTable from "@/components/PricingTable";
import Particles from "@/components/Particles";

const FAQ = [
  {
    q: "¿Cómo funciona la prueba gratis del plan Pro?",
    a: "14 días sin tarjeta. Si no continúas, tu cuenta vuelve a Free automáticamente y conservas tus datos.",
  },
  {
    q: "¿Puedo cambiar de plan en cualquier momento?",
    a: "Sí. Subir o bajar es inmediato y prorrateamos lo no usado del ciclo en curso.",
  },
  {
    q: "¿La auto-publicación funciona en cuentas personales?",
    a: "No. Instagram solo permite publicar via API en cuentas Business o Creator vinculadas a una página de Facebook.",
  },
  {
    q: "¿Cuántos clientes puedo invitar a una marca?",
    a: "En Pro y Agency, ilimitados. En Free, uno por marca.",
  },
];

export default function PricingPage() {
  return (
    <div className="theme-dark flex min-h-screen flex-col bg-black">
      <PublicHeader />
      <section className="relative overflow-hidden">
        <Particles count={20} />
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div
            className="blob blob-b"
            style={{
              width: 580,
              height: 580,
              top: "-150px",
              right: "-200px",
              background: "radial-gradient(circle, #8a2be2 0%, transparent 70%)",
            }}
          />
        </div>
        <div className="relative mx-auto w-full max-w-6xl px-6 py-24">
          <div className="text-center">
            <p className="text-[11px] font-semibold uppercase tracking-widest brand-gradient-text">
              Precios
            </p>
            <h1 className="mt-2 text-4xl font-bold tracking-tight text-white sm:text-6xl">
              Un plan para cada
              <br />
              <span className="brand-gradient-text">etapa de tu agencia</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-zinc-400">
              Empieza gratis y escala cuando lo necesites. Todos los planes incluyen
              comentarios anclados, vista feed/calendario y soporte por email.
            </p>
          </div>
          <div className="mt-14">
            <PricingTable />
          </div>
          <p className="mt-8 text-center text-xs text-zinc-500">
            Precios en USD. IVA no incluido.
          </p>
        </div>
      </section>

      <section id="faq" className="border-t divider bg-[#06060a]">
        <div className="mx-auto w-full max-w-3xl px-6 py-24">
          <h2 className="text-center text-2xl font-bold tracking-tight text-white sm:text-4xl">
            Preguntas frecuentes
          </h2>
          <div className="mt-10 space-y-3">
            {FAQ.map((f) => (
              <details key={f.q} className="card group p-5">
                <summary className="flex cursor-pointer items-center justify-between text-sm font-semibold text-white">
                  {f.q}
                  <span className="ml-4 text-zinc-500 transition group-open:rotate-180">
                    ▾
                  </span>
                </summary>
                <p className="mt-3 text-sm text-zinc-400">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
