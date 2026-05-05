"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  FileText,
  Inbox,
  LayoutDashboard,
  Layers,
  Loader2,
  MessageSquare,
  Search,
  Settings,
  User,
} from "lucide-react";
import { STATUS_COLOR, STATUS_LABEL } from "@/lib/utils";
import { useModKey } from "@/lib/platform";

type PostHit = {
  id: string;
  brandId: string;
  brandName: string;
  caption: string;
  imageUrl: string | null;
  status: string;
};
type BrandHit = { id: string; name: string; handle: string | null };

type CommentHit = {
  id: string;
  body: string;
  authorName: string;
  postId: string;
  brandId: string;
  brandName: string;
  postImageUrl: string | null;
  createdAt: string;
};

type NavItem = {
  kind: "nav";
  key: string;
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
};
type Result =
  | NavItem
  | { kind: "brand"; key: string; data: BrandHit }
  | { kind: "post"; key: string; data: PostHit }
  | { kind: "comment"; key: string; data: CommentHit };

const NAV: NavItem[] = [
  { kind: "nav", key: "n-dash", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { kind: "nav", key: "n-brands", label: "Marcas", href: "/brands", icon: Layers },
  { kind: "nav", key: "n-inbox", label: "Inbox", href: "/inbox", icon: Inbox },
  { kind: "nav", key: "n-account", label: "Cuenta", href: "/account", icon: Settings },
  { kind: "nav", key: "n-team", label: "Equipo", href: "/team", icon: User },
];

export default function CommandPalette() {
  const router = useRouter();
  const mod = useModKey();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [posts, setPosts] = useState<PostHit[]>([]);
  const [brands, setBrands] = useState<BrandHit[]>([]);
  const [comments, setComments] = useState<CommentHit[]>([]);
  const [active, setActive] = useState(0);

  // Cmd+K / Ctrl+K para abrir
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Reset al abrir
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQ("");
      setActive(0);
    }
  }, [open]);

  // Búsqueda con debounce
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setPosts([]);
      setBrands([]);
      setComments([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        if (cancelled) return;
        setPosts(j.posts ?? []);
        setBrands(j.brands ?? []);
        setComments(j.comments ?? []);
        setActive(0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  const term = q.trim().toLowerCase();
  const visibleNav = term.length >= 1 ? NAV.filter((n) => n.label.toLowerCase().includes(term)) : NAV;

  const results: Result[] =
    term.length < 2
      ? visibleNav
      : [
          ...visibleNav,
          ...brands.map<Result>((b) => ({ kind: "brand", key: `b-${b.id}`, data: b })),
          ...posts.map<Result>((p) => ({ kind: "post", key: `p-${p.id}`, data: p })),
          ...comments.map<Result>((c) => ({ kind: "comment", key: `c-${c.id}`, data: c })),
        ];

  function go(idx: number) {
    const r = results[idx];
    if (!r) return;
    setOpen(false);
    if (r.kind === "nav") router.push(r.href);
    else if (r.kind === "brand") router.push(`/brands/${r.data.id}`);
    else if (r.kind === "post") router.push(`/brands/${r.data.brandId}/posts/${r.data.id}`);
    else router.push(`/brands/${r.data.brandId}/posts/${r.data.postId}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, Math.max(0, results.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(active);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl overflow-hidden rounded-2xl border bg-white shadow-2xl divider"
      >
        <div className="flex items-center gap-2 border-b divider px-4">
          <Search className="h-4 w-4 text-zinc-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Buscar marcas, posts, navegar…"
            className="flex-1 border-0 bg-transparent py-3 text-[14px] text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
          />
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />}
          <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] font-mono text-zinc-500">
            Esc
          </kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto py-1">
          {results.length === 0 ? (
            <p className="px-4 py-8 text-center text-[12px] text-zinc-500">
              {term.length < 2 ? "Empieza a escribir…" : `Sin resultados para "${q}"`}
            </p>
          ) : (
            <ul>
              {results.map((r, idx) => (
                <li key={r.key}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => go(idx)}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left transition ${
                      idx === active ? "bg-fuchsia-50" : "hover:bg-zinc-50"
                    }`}
                  >
                    {r.kind === "nav" ? (
                      <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-md bg-zinc-100 text-zinc-600">
                        <r.icon className="h-3.5 w-3.5" />
                      </span>
                    ) : r.kind === "brand" ? (
                      <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-md bg-gradient-to-br from-blue-50 via-fuchsia-50 to-rose-50 text-zinc-600">
                        <Layers className="h-3.5 w-3.5" />
                      </span>
                    ) : r.kind === "comment" ? (
                      r.data.postImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={r.data.postImageUrl}
                          alt=""
                          className="h-8 w-8 flex-shrink-0 rounded-md object-cover"
                        />
                      ) : (
                        <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-md bg-amber-50 text-amber-600">
                          <MessageSquare className="h-3.5 w-3.5" />
                        </span>
                      )
                    ) : r.data.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.data.imageUrl}
                        alt=""
                        className="h-8 w-8 flex-shrink-0 rounded-md object-cover"
                      />
                    ) : (
                      <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-md bg-gradient-to-br from-blue-50 via-fuchsia-50 to-rose-50 text-zinc-600">
                        <FileText className="h-3.5 w-3.5" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      {r.kind === "nav" ? (
                        <>
                          <p className="text-[13px] font-semibold text-zinc-900">{r.label}</p>
                          <p className="text-[10px] uppercase tracking-wider text-zinc-400">Ir a</p>
                        </>
                      ) : r.kind === "brand" ? (
                        <>
                          <p className="truncate text-[13px] font-semibold text-zinc-900">
                            {r.data.name}
                          </p>
                          <p className="truncate text-[11px] text-zinc-500">
                            {r.data.handle ?? "Marca"}
                          </p>
                        </>
                      ) : r.kind === "comment" ? (
                        <>
                          <p className="line-clamp-1 text-[12.5px] text-zinc-900">
                            <span className="font-semibold">{r.data.authorName}</span>:{" "}
                            <span className="font-normal text-zinc-700">{r.data.body}</span>
                          </p>
                          <p className="truncate text-[10.5px] text-zinc-500">
                            Comentario en {r.data.brandName}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="truncate text-[13px] font-semibold text-zinc-900">
                            {r.data.brandName}
                          </p>
                          <p className="truncate text-[11px] text-zinc-500">
                            {r.data.caption || "Sin caption"}
                          </p>
                        </>
                      )}
                    </div>
                    {r.kind === "post" && (
                      <span
                        className={`flex-shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${STATUS_COLOR[r.data.status] ?? "bg-zinc-200"}`}
                      >
                        {STATUS_LABEL[r.data.status] ?? r.data.status}
                      </span>
                    )}
                    {r.kind === "comment" && (
                      <span className="flex-shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                        Comentario
                      </span>
                    )}
                    {idx === active && (
                      <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-zinc-400" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between border-t divider bg-zinc-50/50 px-4 py-2 text-[10px] text-zinc-500">
          <span className="flex items-center gap-3">
            <span>
              <kbd className="font-mono">↑↓</kbd> navegar
            </span>
            <span>
              <kbd className="font-mono">↵</kbd> abrir
            </span>
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1 font-mono">{mod}</kbd>
            <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1 font-mono">K</kbd>
          </span>
        </div>
      </div>
    </div>
  );
}
