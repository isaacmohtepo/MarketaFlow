import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";

/**
 * Banner sticky cuando el plan venció y la agency está en período de gracia
 * (modelo pago-único). Aparece TODOS los días que el owner entra a la app
 * hasta que renueve o se acabe la gracia. No bloquea nada — solo avisa.
 *
 * - daysLeft > 1: tono ámbar (recordatorio amable)
 * - daysLeft <= 1: tono rojo (último aviso antes de bajar a Free)
 *
 * Solo se muestra a owners (los que pueden pagar). Lo renderiza el layout
 * de (app) cuando billingSummary.status === "past_due".
 */
export default function PastDueGraceBanner({
  planName,
  daysLeft,
}: {
  planName: string;
  daysLeft: number;
}) {
  const urgent = daysLeft <= 1;
  return (
    <div
      className={`sticky top-0 z-30 border-b px-4 py-2.5 ${
        urgent
          ? "border-rose-300/60 bg-gradient-to-r from-rose-50 to-amber-50"
          : "border-amber-300/60 bg-gradient-to-r from-amber-50 to-fuchsia-50"
      }`}
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3">
        <span
          className={`grid h-7 w-7 flex-shrink-0 place-items-center rounded-full ${
            urgent ? "bg-rose-500" : "bg-amber-500"
          } text-white`}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={`text-[12.5px] font-semibold ${
              urgent ? "text-rose-900" : "text-amber-900"
            }`}
          >
            Tu plan {planName} venció —{" "}
            {daysLeft <= 0
              ? "hoy baja a Free"
              : daysLeft === 1
                ? "te queda 1 día de gracia"
                : `te quedan ${daysLeft} días de gracia`}
          </p>
          <p
            className={`mt-0.5 text-[11px] ${
              urgent ? "text-rose-700" : "text-amber-800"
            }`}
          >
            Renová pagando para seguir usándolo. No se bloquea nada todavía y
            no perdés data — pasada la gracia solo quedan limitados los extras.
          </p>
        </div>
        <Link
          href="/billing/plan"
          className={`inline-flex flex-shrink-0 items-center gap-1 rounded-full px-3 py-1 text-[11.5px] font-semibold text-white ${
            urgent ? "bg-rose-600 hover:bg-rose-700" : "bg-amber-600 hover:bg-amber-700"
          }`}
        >
          Renovar plan
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
