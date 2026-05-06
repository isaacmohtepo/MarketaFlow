import Link from "next/link";
import { Settings, CreditCard, Users, BarChart3 } from "lucide-react";
import { requireAdmin } from "@/lib/admin";
import AdminNav from "./AdminNav";

/**
 * Layout del admin panel. Verifica que el user sea admin antes de renderizar
 * cualquier subruta. El nav lateral persiste entre secciones.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/dashboard"
        className="text-xs font-medium text-zinc-500 hover:text-zinc-900"
      >
        ← Volver al dashboard
      </Link>
      <h1 className="mt-3 text-2xl font-bold text-zinc-900">Admin</h1>
      <p className="text-sm text-zinc-500">
        Panel de administración global de MarketaFlow.
      </p>

      <div className="mt-6 grid gap-6 sm:grid-cols-[220px_1fr]">
        <aside>
          <AdminNav />
        </aside>
        <div className="min-w-0 space-y-6">{children}</div>
      </div>
    </div>
  );
}
