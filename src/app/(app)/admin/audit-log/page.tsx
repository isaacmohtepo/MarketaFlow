import { ScrollText, User, Shield, CreditCard, Users, KeyRound } from "lucide-react";
import { prisma } from "@/lib/db";

const CATEGORY_META: Record<string, { label: string; Icon: typeof Shield; tone: string }> = {
  auth: { label: "Auth", Icon: User, tone: "text-blue-700 bg-blue-50 ring-blue-200" },
  billing: { label: "Billing", Icon: CreditCard, tone: "text-emerald-700 bg-emerald-50 ring-emerald-200" },
  integrations: { label: "Integrations", Icon: KeyRound, tone: "text-violet-700 bg-violet-50 ring-violet-200" },
  admin: { label: "Admin", Icon: Shield, tone: "text-rose-700 bg-rose-50 ring-rose-200" },
  team: { label: "Team", Icon: Users, tone: "text-amber-700 bg-amber-50 ring-amber-200" },
};

/**
 * Admin → Audit log. Muestra los últimos 200 eventos de cualquier categoría
 * para que el admin (o auditor externo) pueda revisar quién hizo qué.
 *
 * Read-only — no permitimos editar/borrar entradas. El log es append-only.
 */
export default async function AdminAuditLog({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;
  const validCategory = category && CATEGORY_META[category] ? category : null;

  const entries = await prisma.auditLog.findMany({
    where: validCategory ? { category: validCategory } : undefined,
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <section className="card p-6">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-zinc-100 text-zinc-600 ring-1 ring-zinc-200">
          <ScrollText className="h-5 w-5" />
        </span>
        <div className="flex-1">
          <h2 className="text-base font-bold text-zinc-900">Audit log</h2>
          <p className="mt-1 text-[12.5px] text-zinc-500">
            Últimos 200 eventos sensibles. Append-only, read-only. Útil para
            audits de compliance (SOC 2, ISO 27001).
          </p>
        </div>
      </div>

      {/* Filtro por categoría */}
      <div className="mt-5 flex flex-wrap gap-1.5">
        <a
          href="/admin/audit-log"
          className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold transition ${
            !validCategory
              ? "bg-zinc-900 text-white"
              : "bg-white text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-50"
          }`}
        >
          Todas
        </a>
        {Object.entries(CATEGORY_META).map(([cat, meta]) => (
          <a
            key={cat}
            href={`/admin/audit-log?category=${cat}`}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-semibold transition ${
              validCategory === cat
                ? "bg-zinc-900 text-white"
                : "bg-white text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-50"
            }`}
          >
            <meta.Icon className="h-3 w-3" />
            {meta.label}
          </a>
        ))}
      </div>

      {/* Tabla de eventos */}
      <div className="mt-5">
        {entries.length === 0 ? (
          <p className="rounded-lg bg-zinc-50 p-6 text-center text-[12.5px] text-zinc-500">
            Sin eventos {validCategory ? `en categoría "${validCategory}"` : "todavía"}.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {entries.map((e) => {
              const meta = CATEGORY_META[e.category] ?? CATEGORY_META.auth;
              const Icon = meta.Icon;
              return (
                <li key={e.id} className="flex items-start gap-3 py-3">
                  <span
                    className={`mt-0.5 grid h-7 w-7 flex-shrink-0 place-items-center rounded-md ring-1 ${meta.tone}`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-zinc-900">
                      <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[11px] text-zinc-700">
                        {e.action}
                      </code>{" "}
                      <span className="font-normal text-zinc-600">por</span>{" "}
                      {e.actorEmail ?? "—"}
                    </p>
                    {e.metadata && (
                      <pre className="mt-1 overflow-x-auto rounded bg-zinc-50 p-2 font-mono text-[10.5px] leading-relaxed text-zinc-700">
                        {JSON.stringify(e.metadata, null, 2)}
                      </pre>
                    )}
                    {(e.targetId || e.ip) && (
                      <p className="mt-1 text-[10.5px] text-zinc-400">
                        {e.targetId && <>target: <code className="font-mono">{e.targetId}</code> · </>}
                        {e.ip && <>IP: <code className="font-mono">{e.ip}</code></>}
                      </p>
                    )}
                  </div>
                  <span className="flex-shrink-0 text-[10.5px] tabular-nums text-zinc-400">
                    {e.createdAt.toLocaleString("es", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
