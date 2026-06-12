import Link from "next/link";
import { FileText, ChevronRight } from "lucide-react";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma";
import { DataTable, EmptyState, PageHeader, StatusPill } from "@/components/ui";
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
      <PageHeader
        title="Posts"
        subtitle="Búsqueda cross-tenant. Útil cuando un user reporta un post que no aparece o necesitas ver el contenido original."
      />

      <div className="card p-4">
        <PostsFilters />
      </div>

      <DataTable
        rows={items}
        rowKey={(p) => p.id}
        empty={
          <EmptyState
            variant="bare"
            icon={FileText}
            title={total === 0 && !q ? "Sin posts todavía" : "Sin matches"}
          />
        }
        columns={[
          {
            header: "Estado",
            cell: (p) => <StatusBadge status={p.status} deleted={!!p.deletedAt} />,
          },
          {
            header: "Caption",
            className: "max-w-[280px]",
            cell: (p) => (
              <p className="line-clamp-2 text-[12px] text-zinc-900">
                {p.caption || (
                  <span className="italic text-zinc-400">(sin caption)</span>
                )}
              </p>
            ),
          },
          {
            header: "Marca",
            cell: (p) => (
              <span className="text-[12px] text-zinc-700">{p.brand.name}</span>
            ),
          },
          {
            header: "Agencia",
            cell: (p) => (
              <Link
                href={`/admin/agencies/${p.brand.agency.id}`}
                className="text-[11.5px] text-zinc-700 hover:underline"
              >
                {p.brand.agency.name}
              </Link>
            ),
          },
          {
            header: "Fecha",
            cell: (p) => (
              <span className="text-2xs text-zinc-500">
                {p.createdAt.toLocaleDateString("es", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            ),
          },
          {
            header: "",
            align: "right",
            cell: (p) => (
              <Link
                href={`/brands/${p.brand.id}/posts/${p.id}`}
                target="_blank"
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-semibold text-zinc-600 hover:bg-zinc-100"
              >
                Abrir
                <ChevronRight className="h-3 w-3" />
              </Link>
            ),
          },
        ]}
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-2xs text-zinc-500">
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
      <StatusPill tone="bad" size="sm">
        Borrado
      </StatusPill>
    );
  }
  // `published` queda fuchsia (color de marca) — no hay tone equivalente.
  if (status === "published") {
    return (
      <span className="inline-flex rounded-full bg-fuchsia-50 px-2 py-0.5 text-3xs font-bold uppercase tracking-wider text-fuchsia-700 ring-1 ring-fuchsia-200">
        {status}
      </span>
    );
  }
  const tones: Record<string, "neutral" | "warn" | "bad" | "good" | "info"> = {
    draft: "neutral",
    in_review: "warn",
    changes_requested: "bad",
    approved: "good",
    scheduled: "info",
  };
  return (
    <StatusPill tone={tones[status] ?? "neutral"} size="sm">
      {status}
    </StatusPill>
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
