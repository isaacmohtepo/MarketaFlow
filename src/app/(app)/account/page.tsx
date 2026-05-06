import { redirect } from "next/navigation";
import {
  AlertTriangle,
  Bell,
  KeyRound,
  Layers,
  Mail,
  Monitor,
  User as UserIcon,
  Calendar,
  MessageSquare,
  CheckCircle2,
  Shield,
  Download,
  Globe,
  Activity,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { listUserBrands } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import EmailToggle from "./EmailToggle";
import InAppNotifPrefs from "./InAppNotifPrefs";
import ProfileEditor from "./ProfileEditor";
import PasswordChange from "./PasswordChange";
import SessionsList from "./SessionsList";
import BrandsAccessList from "./BrandsAccessList";
import DangerZone from "./DangerZone";
import AccountTabs from "./AccountTabs";
import TimezoneSelector from "./TimezoneSelector";
import DownloadDataButton from "./DownloadDataButton";
import TwoFactorSetup from "./TwoFactorSetup";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const tab = sp.tab ?? "general";

  const [full, brands, stats, recentActivity] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: {
        name: true,
        email: true,
        avatarUrl: true,
        role: true,
        emailNotifications: true,
        timezone: true,
        passwordChangedAt: true,
        totpEnabledAt: true,
        createdAt: true,
      },
    }),
    listUserBrands(user.id),
    Promise.all([
      prisma.comment.count({ where: { userId: user.id } }),
      prisma.approval.count({ where: { userId: user.id } }),
      prisma.session.count({
        where: { userId: user.id, expiresAt: { gt: new Date() } },
      }),
      prisma.membership.count({ where: { userId: user.id } }),
    ]),
    prisma.auditLog.findMany({
      where: { actorUserId: user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        category: true,
        action: true,
        ip: true,
        createdAt: true,
      },
    }),
  ]);

  const [commentsCount, approvalsCount, activeSessions, membershipsCount] = stats;

  return (
    <div className="mx-auto max-w-4xl">
      {/* Hero */}
      <div className="card overflow-hidden">
        <div className="relative bg-gradient-to-br from-fuchsia-500/10 via-rose-100/30 to-amber-100/30 p-6">
          <div className="flex flex-wrap items-start gap-4">
            {full?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={full.avatarUrl}
                alt=""
                className="h-16 w-16 rounded-full object-cover ring-2 ring-white shadow-sm"
              />
            ) : (
              <span className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-fuchsia-500 to-rose-500 text-[18px] font-bold text-white shadow-sm ring-2 ring-white">
                {(full?.name ?? user.email).slice(0, 2).toUpperCase()}
              </span>
            )}

            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold text-zinc-900">
                {full?.name ?? "Sin nombre"}
              </h1>
              <p className="mt-0.5 text-[12.5px] text-zinc-600">{user.email}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                <RoleBadge role={full?.role ?? "agency"} />
                {full?.createdAt && (
                  <span className="inline-flex items-center gap-1 text-zinc-500">
                    <Calendar className="h-3 w-3" />
                    Miembro desde{" "}
                    {full.createdAt.toLocaleDateString("es", {
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                )}
                {full?.timezone && (
                  <span className="inline-flex items-center gap-1 text-zinc-500">
                    <Globe className="h-3 w-3" />
                    {full.timezone}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Mini stats */}
        <div className="grid grid-cols-2 divide-x divide-zinc-100 border-t border-zinc-100 sm:grid-cols-4">
          <Stat icon={<Layers />} label="Marcas" value={membershipsCount} />
          <Stat
            icon={<MessageSquare />}
            label="Comentarios"
            value={commentsCount}
          />
          <Stat
            icon={<CheckCircle2 />}
            label="Aprobaciones"
            value={approvalsCount}
          />
          <Stat
            icon={<Monitor />}
            label="Sesiones activas"
            value={activeSessions}
          />
        </div>
      </div>

      {/* Tabs nav */}
      <div className="mt-6">
        <AccountTabs current={tab} />
      </div>

      {/* Contenido por tab */}
      <div className="mt-5 space-y-5">
        {tab === "general" && (
          <>
            <Section icon={<UserIcon className="h-3.5 w-3.5" />} title="Perfil">
              <ProfileEditor
                initial={{
                  name: full?.name ?? null,
                  avatarUrl: full?.avatarUrl ?? null,
                }}
              />
            </Section>

            <Section
              icon={<Globe className="h-3.5 w-3.5" />}
              title="Zona horaria"
              subtitle="Para mostrar fechas correctamente en emails y la UI."
            >
              <TimezoneSelector initial={full?.timezone ?? null} />
            </Section>

            <Section
              icon={<Layers className="h-3.5 w-3.5" />}
              title="Marcas con acceso"
              subtitle={`${brands.length} ${brands.length === 1 ? "marca" : "marcas"}`}
            >
              <BrandsAccessList brands={brands} />
            </Section>
          </>
        )}

        {tab === "security" && (
          <>
            <Section
              icon={<KeyRound className="h-3.5 w-3.5" />}
              title="Contraseña"
              subtitle={
                full?.passwordChangedAt
                  ? `Última actualización: ${full.passwordChangedAt.toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" })}`
                  : "Nunca cambiada (usás la inicial de registro)"
              }
            >
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
              icon={<Shield className="h-3.5 w-3.5" />}
              title="Autenticación de dos factores"
              subtitle="Protege tu cuenta con código TOTP de tu app autenticadora."
            >
              <TwoFactorSetup
                enabled={!!full?.totpEnabledAt}
                enabledAt={full?.totpEnabledAt ?? null}
              />
            </Section>
          </>
        )}

        {tab === "notifications" && (
          <>
            <Section
              icon={<Bell className="h-3.5 w-3.5" />}
              title="Notificaciones en la app"
              subtitle="Sonido y notificaciones del sistema mientras usás MarketaFlow."
            >
              <InAppNotifPrefs />
            </Section>
            <Section
              icon={<Mail className="h-3.5 w-3.5" />}
              title="Notificaciones por email"
              subtitle="Avisos de posts pendientes, aprobaciones o cambios."
            >
              <EmailToggle initial={full?.emailNotifications ?? true} />
            </Section>
          </>
        )}

        {tab === "activity" && (
          <Section
            icon={<Activity className="h-3.5 w-3.5" />}
            title="Actividad reciente"
            subtitle="Eventos importantes de tu cuenta (login, cambios de password, etc.)"
          >
            {recentActivity.length === 0 ? (
              <p className="text-[12px] text-zinc-500">Sin eventos registrados.</p>
            ) : (
              <ol className="space-y-2">
                {recentActivity.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-start gap-3 rounded-md border border-zinc-100 bg-zinc-50/40 px-3 py-2"
                  >
                    <span className="mt-0.5 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-zinc-600">
                      {a.category}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] font-medium text-zinc-800">
                        {a.action}
                      </p>
                      <p className="text-[10.5px] text-zinc-500">
                        {a.createdAt.toLocaleString("es", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {a.ip && (
                          <>
                            {" · "}
                            <span className="font-mono">{a.ip}</span>
                          </>
                        )}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Section>
        )}

        {tab === "privacy" && (
          <>
            <Section
              icon={<Download className="h-3.5 w-3.5" />}
              title="Descargar mis datos"
              subtitle="JSON con todo lo que tenemos sobre tu cuenta — perfil, comentarios, aprobaciones, sesiones, audit log relevante. GDPR-style."
            >
              <DownloadDataButton />
            </Section>

            <section className="card border-rose-200 p-6">
              <div className="flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-md bg-rose-50 text-rose-600">
                  <AlertTriangle className="h-3.5 w-3.5" />
                </span>
                <h2 className="text-sm font-semibold text-rose-900">
                  Zona de peligro
                </h2>
              </div>
              <p className="mt-1 text-[12px] text-zinc-500">
                Acciones permanentes que no se pueden deshacer.
              </p>
              <div className="mt-4">
                <DangerZone />
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="px-4 py-3 text-center">
      <p className="text-[18px] font-bold tabular-nums text-zinc-900">{value}</p>
      <p className="mt-0.5 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-zinc-400">
        <span className="inline-flex h-3 w-3 items-center justify-center [&>svg]:h-3 [&>svg]:w-3">
          {icon}
        </span>
        {label}
      </p>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    admin: {
      label: "Admin",
      cls: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200",
    },
    agency: {
      label: "Cuenta de agencia",
      cls: "bg-blue-50 text-blue-700 ring-blue-200",
    },
    client: {
      label: "Cuenta cliente",
      cls: "bg-amber-50 text-amber-700 ring-amber-200",
    },
  };
  const meta = map[role] ?? { label: role, cls: "bg-zinc-100 text-zinc-600 ring-zinc-200" };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ${meta.cls}`}
    >
      {meta.label}
    </span>
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
    <section className="card p-6">
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
