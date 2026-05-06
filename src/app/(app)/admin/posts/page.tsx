import Link from "next/link";
import { FileText, ChevronRight } from "lucide-react";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma";
import PostsFilters from "./PostsFilters";

const PAGE_SIZE = 25;

/**
 * Admin → Posts cross-tenant. Búsqueda por caption / brand / agency /
 * status. Útil para soporte cuando un user reporta "no aparece mi post".
 */
export default async function AdminPostsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = strParam(sp.q) ?? "";
  const status = strParam(sp.status) ?? "all";
  const showDeleted = strParam(sp.deleted) === "yes";
  const page = Math.max(1, parseInt(strParam(sp.page) ?? "1", 10) || 1);

  const where: Prisma.PostWhereInput = {};
  if (!showDeleted) where.deletedAt = null;
  if (status !== "all") where.status = status;
  if (q) {
    where.OR = [
      { caption: { contains: q, mode: "insensitive" } },
      { brand: { name: { contains: q, mode: "insensitive" } } },
      { brand: { agency: { name: { contains: q, mode: "insensitive" } } } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.post.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        brand: {
          select: {
            id: true,
            name: true,
            agency: { select: { id: true, name: true } },
          },
        },
      },
    }),
    prisma.post.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-zinc-900">Posts</h1>
        <p className="mt-0.5 text-[12px] text-zinc-500">
          Búsqueda cross-tenant. Útil cuando un user reporta un post que no
          aparece o necesitás ver el contenido original.
        </p>
      </div>

      <div className="card p-4">
        <PostsFilters />

        {items.length === 0 ? (
          <div className="mt-6 rounded-lg border border-dashed border-zinc-200 bg-zinc-50/50 p-8 text-center">
            <FileText className="mx-auto h-8 w-8 text-zinc-300" />
            <p className="mt-3 text-[13px] font-medium text-zinc-700">
              {total === 0 && !q ? "Sin posts todavía" : "Sin matches"}
            </p>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left">
              <thead className="text-[10px] uppercase tracking-wider text-zinc-400">
                <tr className="border-b border-zinc-100">
                  <th className="py-2 pr-3 font-semibold">Estado</th>
                  <th className="py-2 pr-3 font-semibold">Caption</th>
                  <th className="py-2 pr-3 font-semibold">Marca</th>
                  <th className="py-2 pr-3 font-semibold">Agencia</th>
                  <th className="py-2 pr-3 font-semibold">Fecha</th>
                  <th className="py-2 font-semibold"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {items.map((p) => (
                  <tr key={p.id} className="group hover:bg-zinc-50/60">
                    <td className="py-3 pr-3">
                      <StatusBadge status={p.status} deleted={!!p.deletedAt} />
                    </td>
                    <td className="py-3 pr-3 max-w-[280px] text-[12px] text-zinc-900">
                      <p className="line-clamp-2">
                        {p.caption || (
                          <span className="italic text-zinc-400">(sin caption)</span>
                        )}
                      </p>
                    </td>
                    <td className="py-3 pr-3 text-[12px] text-zinc-700">
                      {p.brand.name}
                    </td>
                    <td className="py-3 pr-3 text-[11.5px]">
                      <Link
                        href={`/admin/agencies/${p.brand.agency.id}`}
                        className="text-zinc-700 hover:underline"
                      >
                        {p.brand.agency.name}
                      </Link>
                    </td>
                    <td className="py-3 pr-3 text-[11px] text-zinc-500">
                      {p.createdAt.toLocaleDateString("es", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="py-3 text-right">
                      <Link
                        href={`/brands/${p.brand.id}/posts/${p.id}`}
                        target="_blank"
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-semibold text-zinc-600 hover:bg-zinc-100"
                      >
                        Abrir
                        <ChevronRight className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-[11px] text-zinc-500">
              Mostrando {(page - 1) * PAGE_SIZE + 1}–
              {Math.min(page * PAGE_SIZE, total)} de {total}
            </p>
            <div className="flex gap-1">
              <PageLink page={page - 1} disabled={page <= 1} label="Anterior" sp={sp} />
              <PageLink page={page + 1} disabled={page >= totalPages} label="Siguiente" sp={sp} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function strParam(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function StatusBadge({
  status,
  deleted,
}: {
  status: string;
  deleted: boolean;
}) {
  if (deleted) {
    return (
      <span className="inline-flex rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-700 ring-1 ring-rose-200">
        Borrado
      </span>
    );
  }
  const map: Record<string, string> = {
    draft: "bg-zinc-100 text-zinc-600 ring-zinc-200",
    in_review: "bg-amber-50 text-amber-700 ring-amber-200",
    changes_requested: "bg-rose-50 text-rose-700 ring-rose-200",
    approved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    scheduled: "bg-blue-50 text-blue-700 ring-blue-200",
    published: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ${map[status] ?? "bg-zinc-100 text-zinc-600 ring-zinc-200"}`}
    >
      {status}
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
