"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Undo2,
  X,
} from "lucide-react";
import { useShortcut } from "@/lib/shortcut";

type ReviewPost = {
  id: string;
  caption: string;
  imageUrl: string | null;
  images: string[];
  platform: string;
  scheduledAt: string | null;
};

type Decision = "approved" | "changes_requested" | "skipped";
type HistoryEntry = { postId: string; decision: Decision };

export default function ReviewClient({
  brandId,
  brandName,
  brandLogoUrl,
  brandColor,
  userName,
  posts: initialPosts,
}: {
  brandId: string;
  brandName: string;
  brandLogoUrl: string | null;
  brandColor: string | null;
  userName: string;
  posts: ReviewPost[];
}) {
  const router = useRouter();
  const [posts] = useState<ReviewPost[]>(initialPosts);
  const [index, setIndex] = useState(0);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState("");
  const [slide, setSlide] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const total = posts.length;
  const done = history.length;
  const current = posts[index];

  const slides = useMemo(() => {
    if (!current) return [];
    return current.images.length > 0
      ? current.images
      : current.imageUrl
        ? [current.imageUrl]
        : [];
  }, [current]);

  useEffect(() => {
    setSlide(0);
    setShowNote(false);
    setNote("");
    setError(null);
  }, [index]);

  function advance() {
    setIndex((i) => Math.min(i + 1, total));
  }

  async function decide(decision: "approved" | "changes_requested", noteValue?: string) {
    if (!current || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/posts/${current.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note: noteValue ?? null }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "No se pudo guardar");
      }
      setHistory((h) => [...h, { postId: current.id, decision }]);
      advance();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  function skip() {
    if (!current) return;
    setHistory((h) => [...h, { postId: current.id, decision: "skipped" }]);
    advance();
  }

  function back() {
    if (history.length === 0 || index === 0) return;
    setHistory((h) => h.slice(0, -1));
    setIndex((i) => Math.max(0, i - 1));
  }

  useShortcut("a", () => decide("approved"), { enabled: !!current && !busy && !showNote });
  useShortcut(
    "r",
    () => {
      if (current) setShowNote(true);
    },
    { enabled: !!current && !busy && !showNote },
  );
  useShortcut("s", () => skip(), { enabled: !!current && !busy && !showNote });
  useShortcut(
    "ArrowLeft",
    () => {
      if (slides.length > 1 && slide > 0) setSlide((s) => s - 1);
      else back();
    },
    { enabled: !!current && !showNote },
  );
  useShortcut(
    "ArrowRight",
    () => {
      if (slides.length > 1 && slide < slides.length - 1) setSlide((s) => s + 1);
    },
    { enabled: !!current && !showNote },
  );
  useShortcut(
    "Escape",
    () => {
      if (showNote) {
        setShowNote(false);
        setNote("");
        return;
      }
      router.push(`/brands/${brandId}`);
    },
    { enabled: true },
  );

  // Estado: completado
  if (!current) {
    const approved = history.filter((h) => h.decision === "approved").length;
    const changes = history.filter((h) => h.decision === "changes_requested").length;
    const skipped = history.filter((h) => h.decision === "skipped").length;
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-50 via-fuchsia-50/30 to-blue-50/30">
        <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center p-6 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-2xl brand-gradient text-white shadow-xl">
            <Sparkles className="h-8 w-8" />
          </span>
          <h1 className="mt-5 text-3xl font-bold tracking-tight text-zinc-900">
            ¡Listo, {userName.split(" ")[0]}!
          </h1>
          <p className="mt-2 text-[14px] text-zinc-600">
            Revisaste {done} {done === 1 ? "post" : "posts"} de {brandName}.
          </p>
          <div className="mt-6 grid w-full grid-cols-3 gap-2">
            <Tally label="Aprobados" value={approved} tint="emerald" />
            <Tally label="Cambios" value={changes} tint="rose" />
            <Tally label="Saltados" value={skipped} tint="zinc" />
          </div>
          <div className="mt-8 flex w-full flex-col gap-2">
            <Link
              href={`/brands/${brandId}`}
              className="btn-gradient w-full rounded-full py-3 text-[14px] font-semibold"
            >
              Volver al feed
            </Link>
            <button
              onClick={() => router.refresh()}
              className="rounded-full px-3 py-2 text-[12px] font-medium text-zinc-500 hover:text-zinc-900"
            >
              Buscar más pendientes
            </button>
          </div>
        </div>
      </div>
    );
  }

  const progressPct = total > 0 ? (done / total) * 100 : 0;

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b divider bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <Link
            href={`/brands/${brandId}`}
            className="grid h-8 w-8 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100"
            aria-label="Salir"
            title="Salir (Esc)"
          >
            <X className="h-4 w-4" />
          </Link>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span
              className="grid h-7 w-7 flex-shrink-0 place-items-center overflow-hidden rounded-md text-[11px] font-bold text-white"
              style={{ background: brandColor ?? "#8a2be2" }}
            >
              {brandLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={brandLogoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                brandName[0]?.toUpperCase()
              )}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-zinc-900">{brandName}</p>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                Modo revisión
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[12px] font-semibold tabular-nums text-zinc-900">
              {Math.min(index + 1, total)} / {total}
            </p>
            <div className="mt-0.5 h-1 w-20 overflow-hidden rounded-full bg-zinc-100">
              <div
                className="h-full brand-gradient transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        {/* Imagen */}
        <div className="card relative overflow-hidden p-2">
          <div className="relative aspect-square overflow-hidden rounded-lg bg-zinc-100">
            {slides[slide] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={slides[slide]}
                alt=""
                className="h-full w-full object-cover"
                draggable={false}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-zinc-400">
                Sin imagen
              </div>
            )}
            {slides.length > 1 && (
              <>
                <button
                  onClick={() => setSlide((s) => Math.max(0, s - 1))}
                  disabled={slide === 0}
                  className="absolute left-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white backdrop-blur transition hover:bg-black/70 disabled:opacity-0"
                  aria-label="Imagen anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setSlide((s) => Math.min(slides.length - 1, s + 1))}
                  disabled={slide === slides.length - 1}
                  className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white backdrop-blur transition hover:bg-black/70 disabled:opacity-0"
                  aria-label="Imagen siguiente"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1">
                  {slides.map((_, i) => (
                    <span
                      key={i}
                      className={`h-1.5 w-1.5 rounded-full transition ${
                        i === slide ? "bg-white" : "bg-white/40"
                      }`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Caption */}
        {current.caption && (
          <div className="mt-3 card whitespace-pre-wrap p-4 text-[13.5px] leading-relaxed text-zinc-800">
            {current.caption}
          </div>
        )}

        {/* Meta */}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
          <span className="rounded-full bg-zinc-100 px-2 py-0.5">{current.platform}</span>
          {current.scheduledAt && (
            <span>
              Programado:{" "}
              {new Date(current.scheduledAt).toLocaleString("es", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>

        {error && (
          <p className="mt-3 rounded-md bg-rose-50 p-2 text-[12px] text-rose-700">{error}</p>
        )}

        {/* Acciones */}
        {!showNote ? (
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <button
              onClick={() => decide("approved")}
              disabled={busy}
              className="inline-flex items-center justify-center gap-1.5 rounded-full bg-emerald-600 px-4 py-3 text-[14px] font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
            >
              <Check className="h-4 w-4" />
              Aprobar
              <kbd className="ml-1 rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-mono">A</kbd>
            </button>
            <button
              onClick={() => setShowNote(true)}
              disabled={busy}
              className="inline-flex items-center justify-center gap-1.5 rounded-full bg-rose-600 px-4 py-3 text-[14px] font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-60"
            >
              <X className="h-4 w-4" />
              Pedir cambios
              <kbd className="ml-1 rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-mono">R</kbd>
            </button>
            <button
              onClick={skip}
              disabled={busy}
              className="inline-flex items-center justify-center gap-1.5 rounded-full btn-secondary px-4 py-3 text-[14px] font-semibold sm:col-span-1 col-span-2"
            >
              <ArrowRight className="h-4 w-4" />
              Saltar
              <kbd className="ml-1 rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] font-mono">S</kbd>
            </button>
          </div>
        ) : (
          <div className="mt-5 card p-4">
            <p className="text-[12px] font-semibold text-zinc-900">¿Qué hay que cambiar?</p>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              La nota le llega a la agencia. Sé específico para evitar idas y vueltas.
            </p>
            <textarea
              autoFocus
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ej: cambiar el copy del primer párrafo, la imagen está corrida…"
              className="mt-3 w-full rounded-md input-soft px-3 py-2 text-[13px]"
              rows={4}
            />
            <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
              <button
                onClick={() => {
                  setShowNote(false);
                  setNote("");
                }}
                className="rounded-full px-4 py-2 text-[12px] font-medium text-zinc-500 hover:text-zinc-900"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  decide("changes_requested", note.trim() || undefined);
                }}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-4 py-2 text-[12px] font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                <X className="h-3.5 w-3.5" />
                Enviar pedido de cambios
              </button>
            </div>
          </div>
        )}

        {/* Volver atrás */}
        {history.length > 0 && (
          <div className="mt-4 text-center">
            <button
              onClick={back}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-500 hover:text-zinc-900"
            >
              <Undo2 className="h-3 w-3" />
              Volver al post anterior
            </button>
          </div>
        )}

        <p className="mt-6 text-center text-[10px] text-zinc-400">
          Atajos: <kbd className="font-mono">A</kbd> aprobar ·{" "}
          <kbd className="font-mono">R</kbd> pedir cambios ·{" "}
          <kbd className="font-mono">S</kbd> saltar · <kbd className="font-mono">Esc</kbd> salir
        </p>
      </main>
    </div>
  );
}

const TALLY_TINT: Record<string, string> = {
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  rose: "bg-rose-50 text-rose-700 ring-rose-200",
  zinc: "bg-zinc-100 text-zinc-700 ring-zinc-200",
};

function Tally({
  label,
  value,
  tint,
}: {
  label: string;
  value: number;
  tint: keyof typeof TALLY_TINT;
}) {
  return (
    <div className={`rounded-xl p-3 ring-1 ${TALLY_TINT[tint]}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider opacity-80">
        {label}
      </p>
      <p className="mt-1 text-[22px] font-bold tabular-nums">{value}</p>
    </div>
  );
}
