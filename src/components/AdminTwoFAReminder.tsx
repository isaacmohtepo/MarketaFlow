import Link from "next/link";
import { ShieldAlert, ArrowRight } from "lucide-react";

/**
 * Banner para users admin que NO tienen 2FA activado. Muestra grace period.
 * Visualmente urgente pero no destructivo. Después de N días sin activar,
 * el endpoint `/api/auth/login` puede bloquearles el acceso (lo hacemos
 * via flag soft, no hard, por ahora).
 */
export default function AdminTwoFAReminder({
  daysLeft,
  expired,
}: {
  daysLeft: number;
  expired: boolean;
}) {
  return (
    <div
      className={`sticky top-0 z-30 border-b px-4 py-2.5 ${
        expired
          ? "border-rose-300/60 bg-gradient-to-r from-rose-50 to-amber-50"
          : "border-amber-300/60 bg-gradient-to-r from-amber-50 to-fuchsia-50"
      }`}
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3">
        <span
          className={`grid h-7 w-7 flex-shrink-0 place-items-center rounded-full ${
            expired ? "bg-rose-500" : "bg-amber-500"
          } text-white`}
        >
          <ShieldAlert className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={`text-[12.5px] font-semibold ${
              expired ? "text-rose-900" : "text-amber-900"
            }`}
          >
            {expired
              ? "Activa 2FA YA — eres admin y tu cuenta es de alto valor"
              : `Activa 2FA en tu cuenta de admin (${daysLeft} ${daysLeft === 1 ? "día restante" : "días restantes"})`}
          </p>
          <p
            className={`mt-0.5 text-2xs ${
              expired ? "text-rose-700" : "text-amber-800"
            }`}
          >
            Como admin tienes acceso a datos sensibles de toda la plataforma.
            2FA evita compromisos en caso de leak de password.
          </p>
        </div>
        <Link
          href="/account?tab=security"
          className={`inline-flex flex-shrink-0 items-center gap-1 rounded-full px-3 py-1 text-[11.5px] font-semibold text-white ${
            expired ? "bg-rose-600 hover:bg-rose-700" : "bg-amber-600 hover:bg-amber-700"
          }`}
        >
          Activar 2FA
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
