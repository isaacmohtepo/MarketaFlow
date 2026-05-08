import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronLeft,
  Mail,
  Calendar,
  KeyRound,
  Shield,
  Activity,
  Building2,
} from "lucide-react";
import { prisma } from "@/lib/db";
import UserActions from "./UserActions";
import {
  formatAuditAction,
  formatAuditTime,
  categoryLabel,
  categoryTone,
} from "@/lib/audit-format";

/**
 * Detalle de un usuario para admins. Muestra toda la info + acciones.
 * El layout admin ya gatea por requireAdmin.
 */
export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [user, sessions, recentAudit] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      include: {
        memberships: {
          include: {
            agency: { select: { id: true, name: true } },
            brand: { select: { id: true, name: true } },
          },
          orderBy: { id: "asc" },
        },
        _count: {
          select: {
            memberships: true,
            sessions: true,
            comments: true,
            approvals: true,
            notifications: true,
            activities: true,
          },
        },
      },
    }),
    prisma.session.findMany({
      where: { userId: id, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: "desc" },
      select: {
        id: true,
        userAgent: true,
        ip: true,
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true,
      },
    }),
    prisma.auditLog.findMany({
      where: {
        OR: [{ actorUserId: id }, { targetId: id }],
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        category: true,
        action: true,
        actorEmail: true,
        actorUserId: true,
        targetId: true,
        metadata: true,
        ip: true,
        createdAt: true,
      },
    }),
  ]);

  if (!user) notFound();

  return (
    <div className="space-y-5">
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1 text-[12px] font-medium text-zinc-500 hover:text-zinc-900"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Volver a usuarios
      </Link>

      {/* Hero */}
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-start gap-4 p-6">
          {user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.avatarUrl}
              alt=""
              className="h-16 w-16 rounded-full object-cover ring-2 ring-white"
            />
          ) : (
            <span className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-fuchsia-500 to-rose-500 text-[18px] font-bold text-white">
              {(user.name ?? user.email).slice(0, 2).toUpperCase()}
            </span>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-zinc-900">
                {user.name ?? "Sin nombre"}
              </h1>
              <RolePill role={user.role} />
              {user.disabledAt && (
                <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-700 ring-1 ring-rose-200">
                  Deshabilitado
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[13px] text-zinc-500">{user.email}</p>
            <div className="mt-2 flex flex-wrap gap-3 text-[11.5px] text-zinc-500">
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Creado{" "}
                {user.createdAt.toLocaleDateString("es", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
              <span className="inline-flex items-center gap-1">
                <KeyRound className="h-3 w-3" />
                Pass{" "}
                {user.passwordChangedAt
                  ? user.passwordChangedAt.toLocaleDateString("es", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })
                  : "nunca cambiada"}
              </span>
              <span className="inline-flex items-center gap-1 font-mono text-[10.5px]">
                <Shield className="h-3 w-3" />
                {user.id}
              </span>
            </div>
            {user.disabledAt && user.disabledReason && (
              <p className="mt-2 inline-block rounded-md bg-rose-50 px-2 py-1 text-[11.5px] text-rose-700 ring-1 ring-rose-200">
                Motivo: {user.disabledReason}
              </p>
            )}
          </div>
        </div>

        {/* Mini stats */}
        <div className="grid grid-cols-2 divide-x divide-zinc-100 border-t border-zinc-100 sm:grid-cols-5">
          <Stat label="Memberships" value={user._count.memberships} />
          <Stat label="Sesiones activas" value={sessions.length} />
          <Stat label="Comentarios" value={user._count.comments} />
          <Stat label="Aprobaciones" value={user._count.approvals} />
          <Stat label="Actividad" value={user._count.activities} />
        </div>
      </div>

      {/* Acciones */}
      <UserActions
        userId={user.id}
        email={user.email}
        name={user.name}
        role={user.role}
        emailNotifications={user.emailNotifications}
        disabled={!!user.disabledAt}
        disabledReason={user.disabledReason}
        sessionsCount={sessions.length}
      />

      {/* Memberships */}
      <section className="card p-6">
        <div className="flex items-center gap-2">
          <Building2 className="h-3.5 w-3.5 text-zinc-500" />
          <h2 className="text-sm font-semibold text-zinc-900">
            Memberships ({user.memberships.length})
          </h2>
        </div>
        {user.memberships.length === 0 ? (
          <p className="mt-3 text-[12px] text-zinc-500">
            El usuario no pertenece a ninguna agencia ni marca.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {user.memberships.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-zinc-900">
                    {m.agency.name}
                    {m.brand && (
                      <span className="font-normal text-zinc-500">
                        {" · "}
                        {m.brand.name}
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    {m.brand
                      ? `Brand-scoped (solo ${m.brand.name})`
                      : "Agency-level (toda la agencia)"}
                  </p>
                </div>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-600">
                  {m.role}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Sesiones */}
      <section className="card p-6">
        <h2 className="text-sm font-semibold text-zinc-900">
          Sesiones activas ({sessions.length})
        </h2>
        {sessions.length === 0 ? (
          <p className="mt-3 text-[12px] text-zinc-500">
            El usuario no tiene sesiones activas.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {sessions.map((s) => (
              <li
                key={s.id}
                className="rounded-lg border border-zinc-200 bg-white p-3"
              >
                <p className="text-[12.5px] font-medium text-zinc-900">
                  {parseUA(s.userAgent)}
                </p>
                <p className="mt-0.5 text-[10.5px] text-zinc-500">
                  {s.ip && (
                    <span className="font-mono">
                      {s.ip}
                      {" · "}
                    </span>
                  )}
                  Última actividad{" "}
                  {s.lastSeenAt.toLocaleString("es", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {" · "}Expira{" "}
                  {s.expiresAt.toLocaleDateString("es", {
                    day: "numeric",
                    month: "short",
                  })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Audit log relevante */}
      <section className="card p-6">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-zinc-500" />
          <h2 className="text-sm font-semibold text-zinc-900">
            Actividad reciente ({recentAudit.length})
          </h2>
        </div>
        {recentAudit.length === 0 ? (
          <p className="mt-3 text-[12px] text-zinc-500">Sin actividad registrada.</p>
        ) : (
          <ol className="mt-3 space-y-2 text-[12px]">
            {recentAudit.map((a) => {
              const isActor = a.actorUserId === id;
              const text = formatAuditAction({
                id: a.id,
                category: a.category,
                action: a.action,
                actorEmail: a.actorEmail,
                targetId: a.targetId,
                metadata: a.metadata,
                ip: a.ip,
                createdAt: a.createdAt,
              });
              return (
                <li
                  key={a.id}
                  className="flex items-start gap-3 rounded-md border border-zinc-100 bg-white px-3 py-2"
                >
                  <span
                    className={`mt-0.5 flex-shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ring-1 ${
                      isActor
                        ? "bg-blue-50 text-blue-700 ring-blue-200"
                        : categoryTone(a.category)
                    }`}
                    title={isActor ? "Hizo esta acción" : "Acción recibida"}
                  >
                    {isActor ? "Hizo" : categoryLabel(a.category)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] text-zinc-800">{text}</p>
                    <p className="mt-0.5 text-[10.5px] text-zinc-500">
                      {formatAuditTime(a.createdAt)}
                      {!isActor && a.actorEmail && (
                        <>
                          {" · por "}
                          <span className="font-medium text-zinc-700">
                            {a.actorEmail}
                          </span>
                        </>
                      )}
                      {a.ip && (
                        <>
                          {" · "}
                          <span className="font-mono text-[10px]">{a.ip}</span>
                        </>
                      )}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-4 py-3 text-center">
      <p className="text-[18px] font-bold tabular-nums text-zinc-900">{value}</p>
      <p className="mt-0.5 text-[10px] uppercase tracking-wider text-zinc-400">
        {label}
      </p>
    </div>
  );
}

function RolePill({ role }: { role: string }) {
  const map: Record<string, string> = {
    admin: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200",
    agency: "bg-blue-50 text-blue-700 ring-blue-200",
    client: "bg-amber-50 text-amber-700 ring-amber-200",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ${map[role] ?? "bg-zinc-100 text-zinc-600 ring-zinc-200"}`}
    >
      {role}
    </span>
  );
}

function parseUA(ua: string | null): string {
  if (!ua) return "Desconocido";
  const lower = ua.toLowerCase();
  let device = "Desktop";
  if (/iphone|ipod/.test(lower)) device = "iPhone";
  else if (/ipad/.test(lower)) device = "iPad";
  else if (/android.*mobile/.test(lower)) device = "Android";
  else if (/android/.test(lower)) device = "Android Tablet";
  else if (/macintosh|mac os/.test(lower)) device = "Mac";
  else if (/windows/.test(lower)) device = "Windows";
  else if (/linux/.test(lower)) device = "Linux";

  let browser = "";
  if (/edg\//i.test(ua)) browser = "Edge";
  else if (/chrome\//i.test(ua) && !/chromium/i.test(ua)) browser = "Chrome";
  else if (/firefox\//i.test(ua)) browser = "Firefox";
  else if (/safari\//i.test(ua)) browser = "Safari";

  return browser ? `${device} · ${browser}` : device;
}
