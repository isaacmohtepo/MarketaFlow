import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getUserAgencyName } from "@/lib/agency";
import { prisma } from "@/lib/db";
import AppShell from "@/components/AppShell";
import EmailToggle from "./EmailToggle";

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const [agencyName, full] = await Promise.all([
    getUserAgencyName(user.id),
    prisma.user.findUnique({ where: { id: user.id } }),
  ]);

  return (
    <AppShell userName={user.name ?? user.email} agencyName={agencyName} title="Cuenta">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Cuenta</h1>
        <p className="mt-1 text-sm text-zinc-500">Tus preferencias y datos personales.</p>

        <section className="card mt-6 p-6">
          <h2 className="text-sm font-semibold text-zinc-900">Datos</h2>
          <dl className="mt-3 space-y-2 text-[13px]">
            <div className="flex justify-between">
              <dt className="text-zinc-500">Nombre</dt>
              <dd className="text-zinc-900">{user.name ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Email</dt>
              <dd className="text-zinc-900">{user.email}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Rol</dt>
              <dd className="text-zinc-900">{user.role}</dd>
            </div>
          </dl>
        </section>

        <section className="card mt-6 p-6">
          <h2 className="text-sm font-semibold text-zinc-900">Notificaciones por email</h2>
          <p className="mt-1 text-[12px] text-zinc-500">
            Recibe avisos cuando hay posts pendientes, aprobaciones o cambios solicitados.
          </p>
          <div className="mt-4">
            <EmailToggle initial={full?.emailNotifications ?? true} />
          </div>
        </section>
      </div>
    </AppShell>
  );
}
