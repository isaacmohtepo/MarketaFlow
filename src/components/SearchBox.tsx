"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Loader2, Layers, FileText } from "lucide-react";
import { useShortcut } from "@/lib/shortcut";
import { STATUS_COLOR, STATUS_LABEL } from "@/lib/utils";

type PostHit = {
  id: string;
  number: number | null;
  brandId: string;
  brandSlug: string | null;
  brandName: string;
  caption: string;
  imageUrl: string | null;
  status: string;
};
type BrandHit = {
  id: string;
  slug: string | null;
  name: string;
  handle: string | null;
};

export default function SearchBox() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [posts, setPosts] = useState<PostHit[]>([]);
  const [brands, setBrands] = useState<BrandHit[]>([]);
  const [active, setActive] = useState(0);

  // Atajo "/" para focus
  useShortcut("/", () => inputRef.current?.focus());

  // Click outside
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Debounced search
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setPosts([]);
      setBrands([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(term)}`, {
          cache: "no-store",
        });
        if (!r.ok) return;
        const j = await r.json();
        if (cancelled) return;
        setPosts(j.posts ?? []);
        setBrands(j.brands ?? []);
        setActive(0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  const flatResults = [
    ...brands.map((b) => ({
      kind: "brand" as const,
      key: `b-${b.id}`,
      href: `/brands/${b.slug ?? b.id}`,
      data: b,
    })),
    ...posts.map((p) => ({
      kind: "post" as const,
      key: `p-${p.id}`,
      href: `/brands/${p.brandSlug ?? p.brandId}/posts/${p.number ?? p.id}`,
      data: p,
    })),
  ];

  function go(index: number) {
    const r = flatResults[index];
    if (!r) return;
    router.push(r.href);
    setOpen(false);
    setQ("");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.currentTarget.blur();
      setOpen(false);
      return;
    }
    if (!open || flatResults.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, flatResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(active);
    }
  }

  const showDropdown = open && q.trim().length >= 2;

  return (
    <div ref={wrapRef} className="relative hidden md:block">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Buscar..."
        className="w-48 rounded-md border border-[var(--line)] bg-white py-1.5 pl-8 pr-9 text-[13px] text-zinc-900 placeholder:text-zinc-400 focus:border-fuchsia-400 focus:outline-none focus:shadow-[0_0_0_3px_rgba(138,43,226,0.10)] xl:w-64"
      />
      <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-zinc-200 bg-zinc-50 px-1 text-3xs font-mono text-zinc-500">
        /
      </kbd>

      {showDropdown && (
        <div className="absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-lg border divider bg-white shadow-lg sm:right-auto sm:w-96">
          {loading && flatResults.length === 0 && (
            <div className="flex items-center gap-2 px-4 py-6 text-[12px] text-zinc-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Buscando...
            </div>
          )}
          {!loading && flatResults.length === 0 && (
            <p className="px-4 py-6 text-center text-[12px] text-zinc-500">
              Sin resultados para “{q}”
            </p>
          )}
          {brands.length > 0 && (
            <Section title="Marcas">
              {brands.map((b, i) => {
                const idx = i;
                return (
                  <ResultRow
                    key={`b-${b.id}`}
                    href={`/brands/${b.slug ?? b.id}`}
                    active={idx === active}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => {
                      setOpen(false);
                      setQ("");
                    }}
                    icon={
                      <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-md bg-gradient-to-br from-blue-50 via-fuchsia-50 to-rose-50">
                        <Layers className="h-3.5 w-3.5 text-zinc-600" />
                      </span>
                    }
                    title={b.name}
                    subtitle={b.handle ?? "Marca"}
                  />
                );
              })}
            </Section>
          )}
          {posts.length > 0 && (
            <Section title="Posts">
              {posts.map((p, i) => {
                const idx = brands.length + i;
                return (
                  <ResultRow
                    key={`p-${p.id}`}
                    href={`/brands/${p.brandSlug ?? p.brandId}/posts/${p.number ?? p.id}`}
                    active={idx === active}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => {
                      setOpen(false);
                      setQ("");
                    }}
                    icon={
                      p.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.imageUrl}
                          alt=""
                          className="h-8 w-8 flex-shrink-0 rounded-md object-cover"
                        />
                      ) : (
                        <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-md bg-gradient-to-br from-blue-50 via-fuchsia-50 to-rose-50">
                          <FileText className="h-3.5 w-3.5 text-zinc-600" />
                        </span>
                      )
                    }
                    title={p.brandName}
                    subtitle={p.caption || "Sin caption"}
                    badge={
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-3xs font-medium ${STATUS_COLOR[p.status] ?? "bg-zinc-200"}`}
                      >
                        {STATUS_LABEL[p.status] ?? p.status}
                      </span>
                    }
                  />
                );
              })}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="border-b divider px-3 py-1.5 text-3xs font-semibold uppercase tracking-wider text-zinc-500">
        {title}
      </p>
      <ul>{children}</ul>
    </div>
  );
}

function ResultRow({
  href,
  active,
  onMouseEnter,
  onClick,
  icon,
  title,
  subtitle,
  badge,
}: {
  href: string;
  active: boolean;
  onMouseEnter: () => void;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  badge?: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        onMouseEnter={onMouseEnter}
        onClick={onClick}
        className={`flex items-center gap-2.5 px-3 py-2 text-[13px] transition ${
          active ? "bg-fuchsia-50" : "hover:bg-zinc-50"
        }`}
      >
        {icon}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-zinc-900">{title}</p>
          <p className="truncate text-2xs text-zinc-500">{subtitle}</p>
        </div>
        {badge}
      </Link>
    </li>
  );
}
