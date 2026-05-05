import { redirect } from "next/navigation";
import { AlertTriangle, Bell, KeyRound, Layers, Mail, Monitor, User as UserIcon } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getUserAgencyName } from "@/lib/agency";
import { listUserBrands } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import AppShell from "@/components/AppShell";
import EmailToggle from "./EmailToggle";
import InAppNotifPrefs from "./InAppNotifPrefs";
import ProfileEditor from "./ProfileEditor";
import PasswordChange from "./PasswordChange";
import SessionsList from "./SessionsList";
import BrandsAccessList from "./BrandsAccessList";
import DangerZone from "./DangerZone";

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const [agencyName, full, brands] = await Promise.all([
    getUserAgencyName(user.id),
    prisma.user.findUnique({
      where: { id: user.id },
      select: {
        name: true,
        email: true,
        avatarUrl: true,
        role: true,
        emailNotifications: true,
        createdAt: true,
      },
    }),
    listUserBrands(user.id),
  ]);

  return (
    <AppShell
      userName={user.name ?? user.email}
      avatarUrl={full?.avatarUrl}
      agencyName={agencyName}
      title="Cuenta"
    >
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Cuenta</h1>
        <p className="mt-1 text-sm text-zinc-500">Tus preferencias y datos personales.</p>

        <Section icon={<UserIcon className="h-3.5 w-3.5" />} title="Perfil">
          <ProfileEditor
            initial={{ name: full?.name ?? null, avatarUrl: full?.avatarUrl ?? null }}
          />
          <p className="mt-4 border-t border-zinc-100 pt-3 text-[11px] text-zinc-500">
            <span className="font-medium text-zinc-700">{user.email}</span> ·{" "}
            {full?.role === "agency" ? "Cuenta de agencia" : "Cuenta cliente"}
            {full?.createdAt && (
              <> · Miembro desde {new Date(full.createdAt).toLocaleDateString("es", { month: "short", year: "numeric" })}</>
            )}
          </p>
        </Section>

        <Section icon={<KeyRound className="h-3.5 w-3.5" />} title="Contraseña">
          <PasswordChange />
        </Section>

        <Section
          icon={<Monitor className="h-3.5 w-3.5" />}
          title="Sesiones activas"
          subtitle="Dispositivos donde tu cuenta está conectada."
        >
          <SessionsList />
        </Section>

        <Section
          icon={<Layers className="h-3.5 w-3.5" />}
          title="Marcas con acceso"
          subtitle={`${brands.length} ${brands.length === 1 ? "marca" : "marcas"}`}
        >
          <BrandsAccessList brands={brands} />
        </Section>

        <Section
          icon={<Bell className="h-3.5 w-3.5" />}
          title="Notificaciones en la app"
          subtitle="Sonido y notificaciones del sistema mientras tienes MarketaFlow abierto."
        >
          <InAppNotifPrefs />
        </Section>

        <Section
          icon={<Mail className="h-3.5 w-3.5" />}
          title="Notificaciones por email"
          subtitle="Recibe avisos cuando hay posts pendientes, aprobaciones o cambios solicitados."
        >
          <EmailToggle initial={full?.emailNotifications ?? true} />
        </Section>

        <section className="card mt-6 border-rose-200 p-6">
          <div className="flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-rose-50 text-rose-600">
              <AlertTriangle className="h-3.5 w-3.5" />
            </span>
            <h2 className="text-sm font-semibold text-rose-900">Zona de peligro</h2>
          </div>
          <p className="mt-1 text-[12px] text-zinc-500">
            Acciones permanentes que no se pueden deshacer.
          </p>
          <div className="mt-4">
            <DangerZone />
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function Section({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card mt-6 p-6">
      <div className="flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-zinc-100 text-zinc-600">
          {icon}
        </span>
        <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
      </div>
      {subtitle && <p className="mt-1 text-[12px] text-zinc-500">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}
