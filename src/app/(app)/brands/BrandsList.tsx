"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowUpDown,
  ChevronRight,
  FileText,
  Plus,
  Search,
  Settings,
  Sparkles,
} from "lucide-react";
import Sparkline from "@/app/(app)/dashboard/Sparkline";
import { approvalRateTone, formatHours, type BrandKpis } from "@/lib/kpis-utils";

const TONE_COLOR: Record<"good" | "warn" | "bad" | "neutral", string> = {
  good: "text-emerald-600",
  warn: "text-amber-600",
  bad: "text-rose-600",
  neutral: "text-zinc-400",
};

export type BrandRow = {
  id: string;
  name: string;
  handle: string | null;
  logoUrl: string | null;
  color: string | null;
  agencyName: string;
  role: string;
  total: number;
  pending: number;
  published: number;
  kpis: BrandKpis;
};

type SortKey = "name" | "active" | "pending" | "approval";

const SORT_LABELS: Record<SortKey, string> = {
  name: "Nombre",
  active: "Más activas",
  pending: "Más pendientes",
  approval: "Mejor aprobación",
};

const BRAND_COLORS = ["#3b5fff", "#8a2be2", "#ff4d8f", "#ff2d55", "#0ea5e9", "#22c55e"];

export default function BrandsList({
  brands,
  canCreate,
  onCreatedRefresh,
}: {
  brands: BrandRow[];
  canCreate: boolean;
  onCreatedRefresh?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("active");
  const [onlyPending, setOnlyPending] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let arr = brands.filter((b) => {
      if (onlyPending && b.pending === 0) return false;
      if (!q) return true;
      return (
        b.name.toLowerCase().includes(q) ||
        (b.handle ?? "").toLowerCase().includes(q) ||
        b.agencyName.toLowerCase().includes(q)
      );
    });
    arr = [...arr].sort((a, b) => {
      switch (sort) {
        case "name":
          return a.name.localeCompare(b.name);
        case "pending":
          return b.pending - a.pending || b.total - a.total;
        case "approval":
          return (b.kpis.approvalRate ?? -1) - (a.kpis.approvalRate ?? -1);
        case "active":
        default:
          return (
            b.kpis.publishedTotal - a.kpis.publishedTotal ||
            b.total - a.total ||
            a.name.localeCompare(b.name)
          );
      }
    });
    return arr;
  }, [brands, query, sort, onlyPending]);

  return (
    <div>
      {/* Toolbar */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar marca…"
            className="input-soft w-full rounded-full pl-9 pr-3 py-2 text-[13px]"
          />
        </div>
        <button
          onClick={() => setOnlyPending((v) => !v)}
          className={`rounded-full px-3 py-2 text-[12px] font-semibold transition ${
            onlyPending
              ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
              : "btn-secondary"
          }`}
        >
          Con pendientes
        </button>
        <SortDropdown value={sort} onChange={setSort} />
      </div>

      {/* Conteo */}
      <p className="mt-3 text-[12px] text-zinc-500">
        {filtered.length} {filtered.length === 1 ? "marca" : "marcas"}
        {query && ` · "${query}"`}
      </p>

      {/* Grid */}
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((b, i) => (
          <BrandCard key={b.id} brand={b} colorFallback={BRAND_COLORS[i % BRAND_COLORS.length]} />
        ))}
        {filtered.length === 0 && (
          <div className="card sm:col-span-2 lg:col-span-3 p-10 text-center">
            <Sparkles className="mx-auto h-7 w-7 text-zinc-300" />
            <p className="mt-2 text-[14px] font-medium text-zinc-700">
              No se encontraron marcas
            </p>
            <p className="text-[12px] text-zinc-500">
              {query ? "Probá otra búsqueda." : "Ajustá los filtros."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function BrandCard({ brand: b, colorFallback }: { brand: BrandRow; colorFallback: string }) {
  const bg = b.color ?? colorFallback;
  const tone = approvalRateTone(b.kpis.approvalRate);

  return (
    <div className="card group relative overflow-hidden p-4 transition hover:border-zinc-300">
      <div className="flex items-start gap-3">
        <Link href={`/brands/${b.id}`} className="flex min-w-0 flex-1 items-start gap-3">
          <span
            className="grid h-11 w-11 flex-shrink-0 place-items-center overflow-hidden rounded-lg text-[14px] font-bold text-white"
            style={{ background: bg }}
          >
            {b.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={b.logoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              b.name[0]?.toUpperCase()
            )}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[15px] font-semibold tracking-tight text-zinc-900">
              {b.name}
            </h3>
            {b.handle && (
              <p className="truncate text-[11px] text-zinc-500">{b.handle}</p>
            )}
            <p className="mt-0.5 truncate text-[10px] uppercase tracking-wider text-zinc-400">
              {b.role}
            </p>
          </div>
        </Link>
        <div className="flex flex-col items-end gap-1">
          <Link
            href={`/brands/${b.id}/report`}
            className="grid h-7 w-7 place-items-center rounded-md text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
            title="Reporte mensual"
          >
            <FileText className="h-3.5 w-3.5" />
          </Link>
          {(b.role === "owner" || b.role === "editor") && (
            <Link
              href={`/brands/${b.id}/settings`}
              className="grid h-7 w-7 place-items-center rounded-md text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
              title="Configuración"
            >
              <Settings className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </div>

      {/* Stats row */}
      <Link
        href={`/brands/${b.id}`}
        className="mt-4 flex items-center gap-3 border-t divider pt-3 text-[11px]"
      >
        <Stat label="Posts" value={b.total} />
        <span className="h-7 w-px bg-zinc-200" />
        <Stat label="Pendientes" value={b.pending} accent={b.pending > 0 ? "rose" : undefined} />
        <span className="h-7 w-px bg-zinc-200" />
        <Stat label="Publicados" value={b.published} />
      </Link>

      {/* KPIs */}
      <Link
        href={`/brands/${b.id}`}
        className="mt-3 flex items-end justify-between gap-3 border-t divider pt-3"
      >
        <div className="flex flex-col gap-2">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">
              Aprob. 7d
            </p>
            <p className={`text-[14px] font-semibold tabular-nums ${TONE_COLOR[tone]}`}>
              {b.kpis.approvalRate !== null ? `${b.kpis.approvalRate}%` : "—"}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">
              Tiempo prom. 30d
            </p>
            <p className="text-[12px] font-semibold tabular-nums text-zinc-700">
              {b.kpis.avgApprovalHours !== null ? formatHours(b.kpis.avgApprovalHours) : "—"}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end">
          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">
            Public. 7d · {b.kpis.publishedTotal}
          </p>
          <Sparkline data={b.kpis.publishedSparkline} stroke={bg} width={100} height={28} />
        </div>
      </Link>

      <ChevronRight className="absolute bottom-4 right-4 h-4 w-4 text-zinc-300 opacity-0 transition group-hover:opacity-100" />
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "rose";
}) {
  return (
    <div className="flex-1">
      <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">
        {label}
      </p>
      <p
        className={`mt-0.5 text-[16px] font-semibold tabular-nums ${
          accent === "rose" ? "text-rose-600" : "text-zinc-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function SortDropdown({ value, onChange }: { value: SortKey; onChange: (k: SortKey) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="btn-secondary inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-[12px] font-semibold"
      >
        <ArrowUpDown className="h-3.5 w-3.5" />
        {SORT_LABELS[value]}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-48 overflow-hidden rounded-xl border bg-white shadow-lg divider">
          {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
            <button
              key={k}
              onMouseDown={() => {
                onChange(k);
                setOpen(false);
              }}
              className={`block w-full px-3 py-2 text-left text-[13px] transition hover:bg-zinc-50 ${
                k === value ? "font-semibold text-zinc-900" : "text-zinc-700"
              }`}
            >
              {SORT_LABELS[k]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
