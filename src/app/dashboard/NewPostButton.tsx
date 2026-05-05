"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Plus, ChevronDown } from "lucide-react";

type Brand = { id: string; name: string; logoUrl: string | null; color: string | null };

const BRAND_COLORS = ["#3b5fff", "#8a2be2", "#ff4d8f", "#ff2d55", "#0ea5e9", "#22c55e"];
const LAST_BRAND_KEY = "mf:lastBrandId";

export default function NewPostButton({
  brands,
  defaultBrandId,
}: {
  brands: Brand[];
  defaultBrandId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [lastId, setLastId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem(LAST_BRAND_KEY);
      if (v && brands.some((b) => b.id === v)) setLastId(v);
    } catch {}
  }, [brands]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", onDocClick);
      document.addEventListener("keydown", onKey);
      return () => {
        document.removeEventListener("mousedown", onDocClick);
        document.removeEventListener("keydown", onKey);
      };
    }
  }, [open]);

  if (brands.length === 0) return null;

  if (brands.length === 1) {
    return (
      <Link
        href={`/brands/${brands[0].id}/posts/new`}
        onClick={() => {
          try {
            localStorage.setItem(LAST_BRAND_KEY, brands[0].id);
          } catch {}
        }}
        className="btn-gradient inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold"
      >
        <Plus className="h-4 w-4" />
        Nuevo post
      </Link>
    );
  }

  const preferredId =
    (defaultBrandId && brands.some((b) => b.id === defaultBrandId) ? defaultBrandId : null) ??
    lastId ??
    brands[0].id;

  return (
    <div className="relative inline-flex" ref={ref}>
      <Link
        href={`/brands/${preferredId}/posts/new`}
        onClick={() => {
          try {
            localStorage.setItem(LAST_BRAND_KEY, preferredId);
          } catch {}
        }}
        className="btn-gradient inline-flex items-center gap-1.5 rounded-l-full pl-4 pr-3 py-2 text-[13px] font-semibold"
      >
        <Plus className="h-4 w-4" />
        Nuevo post
      </Link>
      <button
        type="button"
        aria-label="Elegir marca"
        onClick={() => setOpen((v) => !v)}
        className="btn-gradient -ml-px inline-flex items-center rounded-r-full pl-2 pr-3 py-2 text-[13px] font-semibold"
        style={{ borderLeft: "1px solid rgba(255,255,255,0.25)" }}
      >
        <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-64 overflow-hidden rounded-xl border bg-white shadow-lg divider">
          <p className="border-b divider px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Crear post para…
          </p>
          <ul className="max-h-72 overflow-auto py-1">
            {brands.map((b, i) => {
              const bg = b.color ?? BRAND_COLORS[i % BRAND_COLORS.length];
              return (
                <li key={b.id}>
                  <Link
                    href={`/brands/${b.id}/posts/new`}
                    onClick={() => {
                      try {
                        localStorage.setItem(LAST_BRAND_KEY, b.id);
                      } catch {}
                      setOpen(false);
                    }}
                    className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-zinc-800 hover:bg-zinc-50"
                  >
                    <span
                      className="grid h-6 w-6 flex-shrink-0 place-items-center overflow-hidden rounded-md text-[11px] font-bold text-white"
                      style={{ background: bg }}
                    >
                      {b.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={b.logoUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        b.name[0]?.toUpperCase()
                      )}
                    </span>
                    <span className="truncate">{b.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
