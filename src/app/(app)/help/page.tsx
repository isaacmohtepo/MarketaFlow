import Link from "next/link";
import {
  HelpCircle,
  Mail,
  Layers,
  Users,
  CreditCard,
  Sparkles,
  Webhook,
  Zap,
  ChevronRight,
  ExternalLink,
} from "lucide-react";

/**
 * Help center embebido. Documentación inline organizada por categoría
 * con CTA al final para contactar soporte.
 *
 * Por ahora todo es estático en este file. A futuro podemos:
 * - Mover contenido a Markdown editable por admin
 * - Agregar búsqueda
 * - Ticketing system
 */
export default function HelpCenterPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="text-center">
        <span className="grid h-12 w-12 mx-auto place-items-center rounded-2xl brand-gradient text-white shadow-sm">
          <HelpCircle className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-zinc-900">
          ¿En qué te ayudamos?
        </h1>
        <p className="mt-2 text-[13px] text-zinc-500">
          Guías rápidas para los flujos más comunes de MarketaFlow.
        </p>
      </div>

      {/* Quick links */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="card group flex items-start gap-3 p-4 transition hover:border-zinc-300"
          >
            <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-fuchsia-50 text-fuchsia-600">
              <s.icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-zinc-900">
                {s.title}
              </p>
              <p className="mt-0.5 text-[11.5px] text-zinc-500 line-clamp-2">
                {s.summary}
              </p>
            </div>
            <ChevronRight className="ml-auto h-4 w-4 self-center text-zinc-400 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
          </a>
        ))}
      </div>

      {/* Sections */}
      {SECTIONS.map((s) => (
        <section key={s.id} id={s.id} className="card p-6 scroll-mt-20">
          <div className="flex items-center gap-2">
            <s.icon className="h-4 w-4 text-fuchsia-600" />
            <h2 className="text-[15px] font-bold text-zinc-900">{s.title}</h2>
          </div>
          <div className="prose prose-sm mt-4 max-w-none text-[13px] text-zinc-700">
            {s.content}
          </div>
        </section>
      ))}

      {/* Contact */}
      <section className="card border-fuchsia-200 bg-gradient-to-br from-fuchsia-50/40 via-white to-amber-50/30 p-6 text-center">
        <Mail className="h-8 w-8 mx-auto text-fuchsia-600" />
        <h2 className="mt-3 text-base font-bold text-zinc-900">
          ¿Necesitas más ayuda?
        </h2>
        <p className="mt-1 text-[12.5px] text-zinc-600">
          Escríbenos y te respondemos en menos de 24h hábiles.
        </p>
        <a
          href="mailto:soporte@marketaflow.com"
          className="btn-gradient mt-4 inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-[13px] font-semibold"
        >
          <Mail className="h-3.5 w-3.5" />
          soporte@marketaflow.com
        </a>
      </section>
    </div>
  );
}

const SECTIONS: {
  id: string;
  title: string;
  summary: string;
  icon: React.ComponentType<{ className?: string }>;
  content: React.ReactNode;
}[] = [
  {
    id: "marcas",
    title: "Crear y gestionar marcas",
    summary: "Cada cliente es una marca. Cómo crearlas, invitar y configurar.",
    icon: Layers,
    content: (
      <>
        <p>
          Cada cliente que manejas en MarketaFlow se representa como una{" "}
          <strong>marca</strong>. Cada marca tiene su propio feed de posts,
          equipo y aprobaciones independientes.
        </p>
        <ol>
          <li>
            Ve a <Link href="/brands" className="text-fuchsia-600 hover:underline">Marcas</Link> y clic en "Nueva marca"
          </li>
          <li>Completa el nombre, color y logo (opcional)</li>
          <li>
            En la página de la marca puedes invitar clientes con un link público
            (sin registro) o por email
          </li>
          <li>
            Cada post lo creas dentro de una marca específica — el cliente
            solo ve la suya
          </li>
        </ol>
      </>
    ),
  },
  {
    id: "aprobaciones",
    title: "Flujo de aprobación",
    summary:
      "El ciclo: borrador → aprobación interna → revisión del cliente → aprobado.",
    icon: Sparkles,
    content: (
      <>
        <p>El flujo estándar de un post es:</p>
        <ol>
          <li>
            <strong>Borrador</strong>: lo creas internamente. Solo visible para
            tu equipo. Puedes iterar libremente.
          </li>
          <li>
            <strong>Aprobación interna</strong>: el equipo revisa la pieza antes
            de mostrarla al cliente. Quien tenga el permiso de aprobación
            interna le da el visto bueno (o la devuelve a borrador). Este paso
            es opcional según cómo trabaje tu agencia.
          </li>
          <li>
            <strong>En revisión</strong>: lo envías al cliente. Se notifica por
            email + en-app. El cliente puede comentar sobre la imagen y aprobar
            o pedir cambios.
          </li>
          <li>
            <strong>Cambios solicitados</strong>: si el cliente comentó, vuelve
            aquí. Puedes iterar sin re-crear el post.
          </li>
          <li>
            <strong>Aprobado</strong>: el cliente lo aprobó. Queda listo para
            descargar y publicar.
          </li>
        </ol>
        <p className="mt-2 text-[12px] text-zinc-500">
          La programación y publicación automática a redes están en camino; por
          ahora descargas la pieza aprobada y la subes a la red.
        </p>
      </>
    ),
  },
  {
    id: "equipo",
    title: "Invitar al equipo",
    summary: "Roles del sistema, permisos y cómo sumar al equipo o clientes.",
    icon: Users,
    content: (
      <>
        <p>
          MarketaFlow trae varios <strong>roles del sistema</strong>, cada uno
          con sus permisos por defecto (que el owner puede ajustar):
        </p>
        <ul>
          <li>
            <strong>Dueño/a (Owner)</strong>: control total. Maneja facturación,
            invita a otros owners, borra marcas.
          </li>
          <li>
            <strong>Manager</strong>: gestiona equipo, marcas y aprobaciones;
            ve facturación pero no cambia el plan.
          </li>
          <li>
            <strong>Community Manager</strong>: crea, edita y programa posts.
          </li>
          <li>
            <strong>Diseñador/a</strong> y <strong>Copywriter</strong>: suben
            creativos / escriben captions en los posts asignados.
          </li>
          <li>
            <strong>Estratega</strong>: ve dashboards y deja notas; no edita
            contenido.
          </li>
          <li>
            <strong>Cliente</strong>: solo revisa y aprueba en su marca. No ve
            otras marcas.
          </li>
        </ul>
        <p>
          En el plan Agency además puedes crear <strong>roles personalizados</strong>{" "}
          con los permisos exactos que necesites. Ve a{" "}
          <Link href="/team" className="text-fuchsia-600 hover:underline">
            Equipo
          </Link>{" "}
          para invitar miembros y gestionar roles.
        </p>
      </>
    ),
  },
  {
    id: "facturacion",
    title: "Facturación y planes",
    summary: "Planes Free/Pro/Agency, ciclos de cobro, facturas y reembolsos.",
    icon: CreditCard,
    content: (
      <>
        <p>
          MarketaFlow tiene 3 planes con límites distintos. Empiezas siempre
          con un trial de 14 días en Pro automático.
        </p>
        <ul>
          <li>
            <strong>Free</strong>: 1 marca, 30 posts/mes, 1 cliente. Para
            siempre.
          </li>
          <li>
            <strong>Pro</strong>: 8 marcas, posts y clientes ilimitados, equipo
            de hasta 5 con roles.
          </li>
          <li>
            <strong>Agency</strong>: marcas ilimitadas, white label, equipo
            ilimitado.
          </li>
        </ul>
        <p>
          Para upgradear, ve a{" "}
          <Link
            href="/billing"
            className="text-fuchsia-600 hover:underline"
          >
            Facturación
          </Link>{" "}
          y elige el plan. Soportamos pagos con tarjeta (Visa/Master/Amex), PSE,
          Nequi y Daviplata via Wompi.
        </p>
        <p>
          Las facturas las puedes descargar en PDF y exportar a CSV desde la
          misma página. Cobramos automáticamente cada mes/año al método
          guardado.
        </p>
      </>
    ),
  },
  {
    id: "widget",
    title: "Widget de feedback en sitios",
    summary: "Incrustar el widget de revisión en un sitio web cliente.",
    icon: Webhook,
    content: (
      <>
        <p>
          El widget permite que tu cliente comente sobre cualquier elemento
          de su sitio web (no solo imágenes). Útil para diseño, copy,
          landing pages, etc.
        </p>
        <ol>
          <li>
            En la página de la marca, abre "Settings" y copia el script del
            widget
          </li>
          <li>
            Pegalo antes de <code>{"</body>"}</code> en el sitio del cliente
          </li>
          <li>
            Espera unos segundos a que el script pinguee y la URL aparezca
            en MarketaFlow
          </li>
          <li>
            Crea un post tipo "web design" con la URL del sitio. Tu cliente
            puede comentar directo sobre cualquier elemento de la página
          </li>
        </ol>
      </>
    ),
  },
  {
    id: "atajos",
    title: "Atajos de teclado",
    summary: "Cmd+K para buscar, ? para ver todos los shortcuts.",
    icon: Zap,
    content: (
      <>
        <p>
          MarketaFlow está pensado para uso intensivo con teclado. Los más
          importantes:
        </p>
        <ul>
          <li>
            <kbd className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10.5px] font-mono">
              Cmd+K
            </kbd>{" "}
            (Mac) /{" "}
            <kbd className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10.5px] font-mono">
              Ctrl+K
            </kbd>{" "}
            (Windows): paleta de comandos. Buscas cualquier marca, post o
            navegas rápido.
          </li>
          <li>
            <kbd className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10.5px] font-mono">
              ?
            </kbd>
            : muestra todos los atajos disponibles en la pantalla actual.
          </li>
          <li>
            <kbd className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10.5px] font-mono">
              g d
            </kbd>{" "}
            : ir a Dashboard.{" "}
            <kbd className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10.5px] font-mono">
              g i
            </kbd>{" "}
            Inbox.{" "}
            <kbd className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10.5px] font-mono">
              g b
            </kbd>{" "}
            Marcas.
          </li>
        </ul>
      </>
    ),
  },
];
