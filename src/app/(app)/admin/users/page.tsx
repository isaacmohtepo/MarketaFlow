import Link from "next/link";
import { Users, UserPlus, Search, ChevronRight } from "lucide-react";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma";
import UsersFilters from "./UsersFilters";
import CreateUserButton from "./CreateUserButton";

const PAGE_SIZE = 25;

/**
 * Admin → Lista de usuarios. Búsqueda por email/nombre, filtro por rol y
 * estado, paginación, link al detalle.
 */
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = strParam(sp.q) ?? "";
  const role = strParam(sp.role) ?? "all";
  const status = strParam(sp.status) ?? "all";
  const page = Math.max(1, parseInt(strParam(sp.page) ?? "1", 10) || 1);

  const where: Prisma.UserWhereInput = {};
  if (q) {
    where.OR = [
      { email: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
    ];
  }
  if (role !== "all") where.role = role;
  if (status === "disabled") where.disabledAt = { not: null };
  if (status === "active") where.disabledAt = null;

  const [items, totalCount, totalAll, totalDisabled] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        role: true,
        disabledAt: true,
        createdAt: true,
        _count: { select: { memberships: true, sessions: true } },
      },
    }),
    prisma.user.count({ where }),
    prisma.user.count(),
    prisma.user.count({ where: { disabledAt: { not: null } } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">Usuarios</h1>
          <p className="mt-0.5 text-[12px] text-zinc-500">
            {totalAll} usuarios totales · {totalDisabled} deshabilitados
          </p>
        </div>
        <CreateUserButton />
      </div>

      <div className="card p-4">
        <UsersFilters />

        {items.length === 0 ? (
          <div className="mt-6 rounded-lg border border-dashed border-zinc-200 bg-zinc-50/50 p-8 text-center">
            <Users className="mx-auto h-8 w-8 text-zinc-300" />
            <p className="mt-3 text-[13px] font-medium text-zinc-700">
              {totalAll === 0
                ? "Aún no hay usuarios"
                : "Ningún usuario matchea los filtros"}
            </p>
            {totalAll > 0 && (
              <p className="mt-1 text-[11.5px] text-zinc-500">
                Probá limpiar la búsqueda.
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left">
                <thead className="text-[10px] uppercase tracking-wider text-zinc-400">
                  <tr className="border-b border-zinc-100">
                    <th className="py-2 pr-3 font-semibold">Usuario</th>
                    <th className="py-2 pr-3 font-semibold">Rol</th>
                    <th className="py-2 pr-3 font-semibold">Estado</th>
                    <th className="py-2 pr-3 font-semibold">Memberships</th>
                    <th className="py-2 pr-3 font-semibold">Creado</th>
                    <th className="py-2 font-semibold"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {items.map((u) => (
                    <tr
                      key={u.id}
                      className="group transition hover:bg-zinc-50/60"
                    >
                      <td className="py-3 pr-3">
                        <Link
                          href={`/admin/users/${u.id}`}
                          className="flex items-center gap-3"
                        >
                          {u.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={u.avatarUrl}
                              alt=""
                              className="h-8 w-8 rounded-full object-cover"
                            />
                          ) : (
                            <span className="grid h-8 w-8 place-items-center rounded-full bg-zinc-100 text-[11px] font-bold text-zinc-600">
                              {(u.name ?? u.email).slice(0, 2).toUpperCase()}
                            </span>
                          )}
                          <div className="min-w-0">
                            <p className="text-[13px] font-semibold text-zinc-900">
                              {u.name ?? "—"}
                            </p>
                            <p className="text-[11.5px] text-zinc-500">
                              {u.email}
                            </p>
                          </div>
                        </Link>
                      </td>
                      <td className="py-3 pr-3">
                        <RolePill role={u.role} />
                      </td>
                      <td className="py-3 pr-3">
                        {u.disabledAt ? (
                          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-700 ring-1 ring-rose-200">
                            Deshabilitado
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 ring-1 ring-emerald-200">
                            Activo
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-3 text-[12px] tabular-nums text-zinc-600">
                        {u._count.memberships}
                      </td>
                      <td className="py-3 pr-3 text-[11.5px] text-zinc-500">
                        {u.createdAt.toLocaleDateString("es", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="py-3 text-right">
                        <Link
                          href={`/admin/users/${u.id}`}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-semibold text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                        >
                          Detalle
                          <ChevronRight className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-[11px] text-zinc-500">
                  Mostrando {(page - 1) * PAGE_SIZE + 1}–
                  {Math.min(page * PAGE_SIZE, totalCount)} de {totalCount}
                </p>
                <div className="flex gap-1">
                  <PageLink
                    page={page - 1}
                    disabled={page <= 1}
                    label="Anterior"
                    sp={sp}
                  />
                  <PageLink
                    page={page + 1}
                    disabled={page >= totalPages}
                    label="Siguiente"
                    sp={sp}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function strParam(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
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

function PageLink({
  page,
  disabled,
  label,
  sp,
}: {
  page: number;
  disabled: boolean;
  label: string;
  sp: Record<string, string | string[] | undefined>;
}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (Array.isArray(v)) params.set(k, v[0] ?? "");
    else if (v) params.set(k, v);
  }
  params.set("page", String(page));
  if (disabled) {
    return (
      <span className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-[11.5px] font-semibold text-zinc-300">
        {label}
      </span>
    );
  }
  return (
    <Link
      href={`?${params.toString()}`}
      scroll={false}
      className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-[11.5px] font-semibold text-zinc-700 hover:bg-zinc-50"
    >
      {label}
    </Link>
  );
}
