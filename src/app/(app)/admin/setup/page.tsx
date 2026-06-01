import { CheckCircle2, KeyRound, AlertTriangle, ScrollText } from "lucide-react";
import { hasMasterKey } from "@/lib/encryption";
import { prisma } from "@/lib/db";
import GenerateKeyButton from "./GenerateKeyButton";
import KeyManagementSection from "./KeyManagementSection";

/**
 * Admin → Setup. Genera la master key de encriptación que protege las llaves
 * de pasarelas de pago. Se ejecuta una sola vez en el primer setup. Después
 * permite rotar la key y exportarla para backup.
 *
 * La key se guarda en `SystemConfig` table (no en env vars), para que admins
 * puedan hacer setup desde el panel sin tocar Vercel.
 */
export default async function AdminSetup() {
  const ready = await hasMasterKey();
  const [configsCount, rotations] = await Promise.all([
    prisma.integrationConfig.count(),
    prisma.keyRotationLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  return (
    <div className="space-y-6">
      <section className="card p-6">
        <div className="flex items-start gap-3">
          <span
            className={`grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl ${
              ready
                ? "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200"
                : "bg-amber-50 text-amber-600 ring-1 ring-amber-200"
            }`}
          >
            {ready ? <CheckCircle2 className="h-5 w-5" /> : <KeyRound className="h-5 w-5" />}
          </span>
          <div className="flex-1">
            <h2 className="text-base font-bold text-zinc-900">
              Master key de encriptación
            </h2>
            <p className="mt-1 text-[13px] text-zinc-500">
              Esta llave protege con AES-256-GCM todas las API keys que guardas
              en el panel de integraciones (Wompi, Stripe, etc.). Se genera una
              sola vez y vive en la DB. No se puede ver — solo se usa.
            </p>
          </div>
        </div>

        {ready ? (
          <div className="mt-5 space-y-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
              <p className="text-[13.5px] font-semibold text-emerald-900">
                ✓ Master key activa
              </p>
              <p className="mt-1 text-[12px] text-emerald-800">
                {configsCount > 0 ? (
                  <>
                    Encriptando {configsCount}{" "}
                    {configsCount === 1 ? "integración" : "integraciones"}. Las
                    llaves de Wompi/Stripe que guardas en{" "}
                    <a
                      href="/admin/integrations"
                      className="font-semibold underline hover:no-underline"
                    >
                      Integraciones
                    </a>{" "}
                    están protegidas con esta key.
                  </>
                ) : (
                  <>
                    Configurada y lista. Ya puedes ir a{" "}
                    <a
                      href="/admin/integrations"
                      className="font-semibold underline hover:no-underline"
                    >
                      Integraciones
                    </a>{" "}
                    a configurar pasarelas de pago.
                  </>
                )}
              </p>
            </div>
            <KeyManagementSection configsCount={configsCount} />
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
              <p className="flex items-center gap-1.5 text-[13.5px] font-semibold text-amber-900">
                <AlertTriangle className="h-4 w-4" />
                Setup pendiente
              </p>
              <p className="mt-1 text-[12px] text-amber-800">
                Antes de poder configurar pasarelas de pago, necesitas generar
                la master key. Es un solo click. La generamos del lado del
                servidor con <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-[10px]">crypto.randomBytes(32)</code>.
              </p>
            </div>
            <GenerateKeyButton />
          </div>
        )}
      </section>

      <section className="card p-6">
        <h3 className="text-sm font-semibold text-zinc-900">Cómo funciona</h3>
        <ul className="mt-3 space-y-2 text-[12.5px] text-zinc-600">
          <li className="flex items-start gap-2">
            <span className="grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-zinc-100 text-[10px] font-bold text-zinc-700">
              1
            </span>
            <span>
              Click en "Generar master key" — el servidor crea 32 bytes random
              y los guarda en la tabla <code className="font-mono">SystemConfig</code>.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-zinc-100 text-[10px] font-bold text-zinc-700">
              2
            </span>
            <span>
              Cuando configuras Wompi/Stripe en{" "}
              <code className="font-mono">/admin/integrations</code>, las llaves
              se encriptan con esta master key antes de guardarse.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-zinc-100 text-[10px] font-bold text-zinc-700">
              3
            </span>
            <span>
              Cada vez que la app cobra (checkout, cron de renovaciones, etc.),
              desencripta on-the-fly. Nunca se loggea en plain text.
            </span>
          </li>
        </ul>
      </section>

      {ready && rotations.length > 0 && (
        <section className="card p-6">
          <div className="flex items-center gap-2">
            <ScrollText className="h-4 w-4 text-zinc-400" />
            <h3 className="text-sm font-semibold text-zinc-900">
              Historial de rotaciones
            </h3>
          </div>
          <ul className="mt-3 divide-y divide-zinc-100">
            {rotations.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 py-2.5 text-[12.5px]"
              >
                <div className="min-w-0">
                  <p className="font-medium text-zinc-900">{r.rotatedByEmail}</p>
                  {r.reason && (
                    <p className="mt-0.5 truncate text-[11px] italic text-zinc-500">
                      "{r.reason}"
                    </p>
                  )}
                </div>
                <div className="flex flex-shrink-0 items-center gap-2 text-zinc-500">
                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-zinc-700">
                    {r.configsReEncrypted}{" "}
                    {r.configsReEncrypted === 1 ? "config" : "configs"}
                  </span>
                  <span className="text-[11px] tabular-nums">
                    {r.createdAt.toLocaleDateString("es", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card p-6">
        <h3 className="text-sm font-semibold text-zinc-900">⚠ Importante</h3>
        <ul className="mt-3 space-y-2 text-[12.5px] text-zinc-600">
          <li>
            • Si borras el row de SystemConfig (o se pierde el DB), las llaves
            de pasarelas guardadas se vuelven irrecuperables. Tienes que
            reconfigurarlas.
          </li>
          <li>
            • Haz backup de tu DB con regularidad (Neon tiene backups
            automáticos).
          </li>
          <li>
            • La master key NO se devuelve al cliente. Solo el servidor la usa
            internamente.
          </li>
        </ul>
      </section>
    </div>
  );
}
