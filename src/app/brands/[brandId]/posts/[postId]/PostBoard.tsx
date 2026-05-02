"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useShortcut } from "@/lib/shortcut";
import { Check, MoreHorizontal, Pencil, Trash2, CornerDownRight, GitCompare, UploadCloud, RotateCcw, AlertTriangle } from "lucide-react";
import NewVersionModal from "./NewVersionModal";
import BeforeAfterSlider from "./BeforeAfterSlider";

export type PostVersionLite = {
  id: string;
  version: number;
  caption: string;
  images: string[];
  note: string | null;
  createdAt: string;
};

type Comment = {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  userName: string;
  userId: string;
  x: number | null;
  y: number | null;
  parentId: string | null;
  resolved: boolean;
};

export default function PostBoard({
  postId,
  imageUrl,
  images,
  canApprove,
  canEdit,
  currentStatus,
  publishedUrl,
  publishError,
  currentUserId,
  isDeleted,
  prevId,
  nextId,
  initialComments,
  versions,
}: {
  postId: string;
  imageUrl: string | null;
  images: string[];
  canApprove: boolean;
  canEdit: boolean;
  currentStatus: string;
  publishedUrl: string | null;
  publishError: string | null;
  currentUserId: string;
  isDeleted: boolean;
  prevId: string | null;
  nextId: string | null;
  initialComments: Comment[];
  versions: PostVersionLite[];
}) {
  const router = useRouter();
  const params = useParams<{ brandId: string }>();
  const brandIdFromUrl = params?.brandId;
  const imgWrapRef = useRef<HTMLDivElement>(null);
  const commentInputRef = useRef<HTMLInputElement>(null);
  const [comments, setComments] = useState(initialComments);
  const [pinDraft, setPinDraft] = useState<{ x: number; y: number } | null>(null);
  const [draftBody, setDraftBody] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [slide, setSlide] = useState(0);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [showResolved, setShowResolved] = useState(false);
  const [versionModalOpen, setVersionModalOpen] = useState(false);
  const [compareWith, setCompareWith] = useState<string | null>(null);

  // ========== Keyboard shortcuts ==========
  const canUseApprove =
    canApprove &&
    !isDeleted &&
    (currentStatus === "in_review" || currentStatus === "changes_requested");

  useShortcut(
    "a",
    () => {
      if (canUseApprove) decide("approved");
    },
    { enabled: canUseApprove },
  );

  useShortcut(
    "r",
    () => {
      if (canUseApprove) decide("changes_requested");
    },
    { enabled: canUseApprove },
  );

  useShortcut("c", () => {
    commentInputRef.current?.focus();
  });

  useShortcut("ArrowLeft", () => {
    if (prevId && brandIdFromUrl) {
      router.push(`/brands/${brandIdFromUrl}/posts/${prevId}`);
    }
  });

  useShortcut("ArrowRight", () => {
    if (nextId && brandIdFromUrl) {
      router.push(`/brands/${brandIdFromUrl}/posts/${nextId}`);
    }
  });

  useShortcut("Escape", () => {
    if (compareWith) {
      setCompareWith(null);
      return;
    }
    if (versionModalOpen) {
      setVersionModalOpen(false);
      return;
    }
    if (brandIdFromUrl) router.push(`/brands/${brandIdFromUrl}`);
  });

  const slides = images.length > 0 ? images : imageUrl ? [imageUrl] : [];
  const currentSlide = slides[slide] ?? null;
  const hasCarousel = slides.length > 1;

  const { parents, repliesByParent } = useMemo(() => {
    const ps: Comment[] = [];
    const map = new Map<string, Comment[]>();
    for (const c of comments) {
      if (c.parentId) {
        const arr = map.get(c.parentId) ?? [];
        arr.push(c);
        map.set(c.parentId, arr);
      } else {
        ps.push(c);
      }
    }
    ps.sort((a, b) => {
      if (a.resolved !== b.resolved) return a.resolved ? 1 : -1;
      return a.createdAt.localeCompare(b.createdAt);
    });
    for (const arr of map.values()) {
      arr.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }
    return { parents: ps, repliesByParent: map };
  }, [comments]);

  const visibleParents = showResolved ? parents : parents.filter((p) => !p.resolved);
  const positionalComments = parents.filter(
    (c) => c.x != null && c.y != null && (showResolved || !c.resolved),
  );
  const pinIndex = new Map(positionalComments.map((c, i) => [c.id, i + 1]));
  const hovered = comments.find((c) => c.id === hoverId);

  function onImageClick(e: React.MouseEvent<HTMLDivElement>) {
    const wrap = imgWrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    setPinDraft({ x, y });
    setDraftBody("");
  }

  async function savePin() {
    if (!pinDraft || !draftBody.trim()) return;
    setBusy(true);
    const res = await fetch(`/api/posts/${postId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: draftBody, x: pinDraft.x, y: pinDraft.y }),
    });
    setBusy(false);
    if (res.ok) {
      const j = await res.json();
      setComments((c) => [...c, j.comment]);
      setPinDraft(null);
      setDraftBody("");
    }
  }

  async function addComment(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    const res = await fetch(`/api/posts/${postId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    setBusy(false);
    if (res.ok) {
      const j = await res.json();
      setComments((c) => [...c, j.comment]);
      setBody("");
    }
  }

  async function sendReply(parentId: string) {
    if (!replyBody.trim()) return;
    setBusy(true);
    const res = await fetch(`/api/posts/${postId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: replyBody, parentId }),
    });
    setBusy(false);
    if (res.ok) {
      const j = await res.json();
      setComments((c) => [...c, j.comment]);
      setReplyBody("");
      setReplyTo(null);
    }
  }

  async function toggleResolve(c: Comment) {
    setBusy(true);
    const res = await fetch(`/api/comments/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolved: !c.resolved }),
    });
    setBusy(false);
    if (res.ok) {
      const j = await res.json();
      setComments((arr) => arr.map((x) => (x.id === c.id ? { ...x, ...j.comment } : x)));
    }
  }

  async function saveEdit(id: string) {
    if (!editBody.trim()) return;
    setBusy(true);
    const res = await fetch(`/api/comments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: editBody }),
    });
    setBusy(false);
    if (res.ok) {
      const j = await res.json();
      setComments((arr) => arr.map((x) => (x.id === id ? { ...x, ...j.comment } : x)));
      setEditId(null);
      setEditBody("");
    }
  }

  async function deleteComment(id: string) {
    if (!confirm("¿Borrar este comentario?")) return;
    setBusy(true);
    const res = await fetch(`/api/comments/${id}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) {
      setComments((arr) => arr.filter((x) => x.id !== id && x.parentId !== id));
    }
  }

  async function decide(decision: "approved" | "changes_requested") {
    setBusy(true);
    const res = await fetch(`/api/posts/${postId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, note: note.trim() || null }),
    });
    setBusy(false);
    if (res.ok) {
      setNote("");
      router.refresh();
    }
  }

  async function changeStatus(status: string) {
    setBusy(true);
    await fetch(`/api/posts/${postId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBusy(false);
    router.refresh();
  }

  async function moveToTrash() {
    if (!confirm("¿Mover este post a la papelera? Podrás restaurarlo después.")) return;
    setBusy(true);
    const res = await fetch(`/api/posts/${postId}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) router.push(`/brands/${images.length > 0 || imageUrl ? "" : ""}`); // fallback
    if (res.ok) {
      // back to brand
      const path = window.location.pathname;
      const m = path.match(/^\/brands\/([^/]+)/);
      router.push(m ? `/brands/${m[1]}` : "/dashboard");
      router.refresh();
    }
  }

  async function restoreFromTrash() {
    setBusy(true);
    const res = await fetch(`/api/posts/${postId}/restore`, { method: "POST" });
    setBusy(false);
    if (res.ok) router.refresh();
  }

  async function purgeForever() {
    if (!confirm("¿Eliminar este post DEFINITIVAMENTE? Esta acción no se puede deshacer.")) return;
    setBusy(true);
    const res = await fetch(`/api/posts/${postId}/purge`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) {
      const path = window.location.pathname;
      const m = path.match(/^\/brands\/([^/]+)/);
      router.push(m ? `/brands/${m[1]}/trash` : "/dashboard");
      router.refresh();
    }
  }

  async function publishNow() {
    setBusy(true);
    const res = await fetch(`/api/posts/${postId}/publish`, { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Error al publicar");
      return;
    }
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <div className="flex flex-col gap-3">
        {compareWith && (
          <BeforeAfterSlider
            before={compareWith}
            after={currentSlide ?? ""}
            beforeLabel={
              versions.find((v) => v.images[0] === compareWith)
                ? `v${versions.find((v) => v.images[0] === compareWith)?.version}`
                : "Antes"
            }
            afterLabel={`v${(versions[0]?.version ?? 0) + 1} (actual)`}
            onClose={() => setCompareWith(null)}
          />
        )}
        <div
          ref={imgWrapRef}
          onClick={onImageClick}
          className={`relative aspect-square cursor-crosshair overflow-hidden rounded-xl card p-2 select-none ${
            compareWith ? "hidden" : ""
          }`}
        >
          {currentSlide ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={currentSlide}
              alt=""
              className="h-full w-full rounded-lg object-cover pointer-events-none"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center rounded-lg bg-gradient-to-br from-blue-50 via-fuchsia-50 to-rose-50 text-sm text-zinc-500">
              sin imagen
            </div>
          )}

          {hasCarousel && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSlide((s) => (s - 1 + slides.length) % slides.length);
                }}
                className="absolute left-3 top-1/2 z-30 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white shadow-lg backdrop-blur transition hover:bg-black/70"
                aria-label="Anterior"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSlide((s) => (s + 1) % slides.length);
                }}
                className="absolute right-3 top-1/2 z-30 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white shadow-lg backdrop-blur transition hover:bg-black/70"
                aria-label="Siguiente"
              >
                ›
              </button>
              <div className="absolute right-3 top-3 z-30 rounded-full bg-black/50 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
                {slide + 1} / {slides.length}
              </div>
              <div className="absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 gap-1.5">
                {slides.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSlide(i);
                    }}
                    className={`h-1.5 rounded-full transition-all ${
                      i === slide ? "w-6 bg-white" : "w-1.5 bg-white/50"
                    }`}
                    aria-label={`Slide ${i + 1}`}
                  />
                ))}
              </div>
            </>
          )}

          {positionalComments.map((c) => {
            const idx = pinIndex.get(c.id)!;
            const active = activeId === c.id || hoverId === c.id;
            const replies = repliesByParent.get(c.id) ?? [];
            return (
              <button
                key={c.id}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveId(active ? null : c.id);
                }}
                onMouseEnter={() => setHoverId(c.id)}
                onMouseLeave={() => setHoverId(null)}
                className={`absolute z-10 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-xs font-bold text-white shadow-lg transition ${
                  active ? "scale-125 ring-4 ring-fuchsia-300/60" : "hover:scale-110"
                } ${c.resolved ? "opacity-60" : ""}`}
                style={{
                  left: `${(c.x as number) * 100}%`,
                  top: `${(c.y as number) * 100}%`,
                  background: c.resolved
                    ? "#22c55e"
                    : "linear-gradient(135deg,#3b5fff 0%,#8a2be2 35%,#ff4d8f 70%,#ff2d55 100%)",
                }}
              >
                {c.resolved ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : idx}
                {replies.length > 0 && (
                  <span className="absolute -right-1 -top-1 grid h-3.5 w-3.5 place-items-center rounded-full bg-white text-[9px] font-bold text-zinc-900 shadow">
                    {replies.length}
                  </span>
                )}
              </button>
            );
          })}

          {/* Tooltip flotante al hover sobre un pin (edge-aware) */}
          {hovered && hovered.x != null && hovered.y != null && activeId !== hovered.id && (
            (() => {
              const x = hovered.x as number;
              const y = hovered.y as number;
              const horiz =
                x < 0.25
                  ? { left: "0%", transform: "translateX(0)" }
                  : x > 0.75
                    ? { right: "0%", left: "auto", transform: "translateX(0)" }
                    : { left: `${x * 100}%`, transform: "translateX(-50%)" };
              const vert =
                y > 0.75
                  ? { bottom: `calc(${(1 - y) * 100}% + 22px)`, top: "auto" }
                  : { top: `calc(${y * 100}% + 22px)` };
              return (
                <div
                  className="pointer-events-none absolute z-20 max-w-[220px] rounded-lg bg-zinc-900/90 px-2.5 py-1.5 text-[11px] text-white shadow-xl backdrop-blur"
                  style={{ ...horiz, ...vert }}
                >
                  <p className="font-semibold opacity-80">{hovered.userName}</p>
                  <p className="mt-0.5 break-words">{hovered.body}</p>
                </div>
              );
            })()
          )}

          {pinDraft && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute z-30 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${pinDraft.x * 100}%`, top: `${pinDraft.y * 100}%` }}
            >
              <div className="relative flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white shadow-lg brand-gradient ring-4 ring-fuchsia-300/60">
                +
              </div>
              {(() => {
                const POP_W = 256;
                const horiz =
                  pinDraft.x < 0.25
                    ? { left: "-12px", transform: "none" }
                    : pinDraft.x > 0.75
                      ? { right: "-12px", left: "auto", transform: "none" }
                      : { left: "50%", transform: "translateX(-50%)" };
                const vert =
                  pinDraft.y > 0.7
                    ? { bottom: "calc(100% + 8px)", top: "auto" }
                    : { top: "calc(100% + 8px)" };
                return (
                  <div
                    className="absolute rounded-xl border divider bg-white p-3 shadow-lg"
                    style={{ width: POP_W, ...horiz, ...vert }}
                  >
                    <textarea
                      autoFocus
                      value={draftBody}
                      onChange={(e) => setDraftBody(e.target.value)}
                      rows={2}
                      placeholder="Comenta sobre este punto..."
                      className="w-full rounded-md input-soft px-2 py-1.5 text-[13px]"
                    />
                    <div className="mt-2 flex justify-end gap-2">
                      <button
                        onClick={() => setPinDraft(null)}
                        className="rounded-md px-3 py-1 text-[12px] font-medium text-zinc-500 hover:text-zinc-900"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={savePin}
                        disabled={busy || !draftBody.trim()}
                        className="btn-gradient rounded-md px-3 py-1 text-[12px] font-semibold disabled:opacity-60"
                      >
                        Anclar
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
        <p className="text-xs text-zinc-500">
          💡 Click en cualquier punto de la imagen para anclar un comentario · pasa el mouse sobre un pin para verlo.
        </p>

        {/* Versions panel */}
        {versions.length > 0 && (
          <div className="card p-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Versiones anteriores
              </p>
              {compareWith && (
                <button
                  onClick={() => setCompareWith(null)}
                  className="text-[11px] font-medium text-fuchsia-700 hover:underline"
                >
                  Cerrar comparación
                </button>
              )}
            </div>
            <ul className="mt-2 space-y-1.5">
              {versions.map((v) => {
                const cover = v.images[0];
                const active = compareWith === cover;
                return (
                  <li key={v.id}>
                    <button
                      onClick={() => setCompareWith(active ? null : cover ?? null)}
                      disabled={!cover}
                      className={`flex w-full items-center gap-2 rounded-md p-1.5 text-left transition ${
                        active
                          ? "bg-fuchsia-50 ring-1 ring-fuchsia-300"
                          : "hover:bg-zinc-50"
                      } disabled:opacity-50`}
                    >
                      {cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={cover}
                          alt=""
                          className="h-9 w-9 flex-shrink-0 rounded object-cover"
                        />
                      ) : (
                        <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded bg-zinc-100 text-[10px] text-zinc-500">
                          —
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-semibold text-zinc-900">
                          Versión {v.version}
                        </p>
                        <p className="truncate text-[10px] text-zinc-500">
                          {new Date(v.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <GitCompare
                        className={`h-3.5 w-3.5 ${
                          active ? "text-fuchsia-700" : "text-zinc-400"
                        }`}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4 lg:aspect-square lg:overflow-hidden">
        {isDeleted && canEdit && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-600" />
              <div className="flex-1">
                <p className="text-[13px] font-semibold text-amber-900">
                  Este post está en la papelera
                </p>
                <p className="mt-0.5 text-[11px] text-amber-800">
                  Restaurarlo lo devuelve al feed con el mismo estado.
                </p>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={restoreFromTrash}
                disabled={busy}
                className="btn-gradient inline-flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-[12px] font-semibold disabled:opacity-60"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Restaurar
              </button>
              <button
                onClick={purgeForever}
                disabled={busy}
                className="inline-flex items-center justify-center gap-1.5 rounded-md border border-rose-300 bg-white px-3 py-2 text-[12px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Borrar definitivo
              </button>
            </div>
          </div>
        )}

        {canEdit && !isDeleted && (
          <StatusSelector
            current={currentStatus}
            disabled={busy}
            onChange={(s) => changeStatus(s)}
          />
        )}

        {canEdit && !isDeleted && currentStatus === "draft" && (
          <button
            onClick={() => changeStatus("in_review")}
            disabled={busy}
            className="btn-gradient w-full rounded-lg py-2.5 text-sm font-semibold disabled:opacity-60"
          >
            Enviar a revisión
          </button>
        )}

        {canEdit && !isDeleted &&
          (currentStatus === "changes_requested" || currentStatus === "in_review") && (
            <button
              onClick={() => setVersionModalOpen(true)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-fuchsia-300 bg-fuchsia-50/50 py-2.5 text-sm font-semibold text-fuchsia-700 transition hover:border-fuchsia-400 hover:bg-fuchsia-50"
            >
              <UploadCloud className="h-4 w-4" />
              Subir nueva versión
            </button>
          )}

        {canEdit && !isDeleted && (currentStatus === "approved" || currentStatus === "scheduled") && (
          <button
            onClick={publishNow}
            disabled={busy}
            className="btn-gradient w-full rounded-lg py-2.5 text-sm font-semibold disabled:opacity-60"
          >
            🚀 Publicar ahora
          </button>
        )}

        {currentStatus === "published" && publishedUrl && (
          <a
            href={publishedUrl}
            target="_blank"
            rel="noreferrer"
            className="block rounded-xl card p-3 text-center text-sm font-semibold text-fuchsia-700 hover:underline"
          >
            ✓ Publicado · ver en redes ↗
          </a>
        )}

        {publishError && currentStatus !== "published" && (
          <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800">
            Error de publicación: {publishError}
          </div>
        )}

        {!isDeleted && canApprove &&
          (currentStatus === "in_review" || currentStatus === "changes_requested") && (
            <div className="card p-4">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Nota opcional (sobre todo si pides cambios)"
                className="w-full rounded-lg input-soft px-3 py-2 text-sm"
              />
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => decide("approved")}
                  disabled={busy}
                  className="btn-gradient flex-1 rounded-lg py-2.5 text-sm font-semibold disabled:opacity-60"
                >
                  ✓ Aprobar
                </button>
                <button
                  onClick={() => decide("changes_requested")}
                  disabled={busy}
                  className="flex-1 rounded-lg border border-rose-200 bg-white py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                >
                  Solicitar cambios
                </button>
              </div>
            </div>
          )}

        <div className="flex flex-1 flex-col lg:min-h-0">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-900">
              Comentarios{" "}
              <span className="font-normal text-zinc-400">({visibleParents.length})</span>
            </h3>
            {parents.some((p) => p.resolved) && (
              <button
                onClick={() => setShowResolved((v) => !v)}
                className="text-[11px] font-medium text-zinc-500 hover:text-zinc-900"
              >
                {showResolved ? "Ocultar resueltos" : "Mostrar resueltos"}
              </button>
            )}
          </div>
          <ul className="scroll-visible mt-2 max-h-[480px] space-y-2 pr-1 lg:max-h-none lg:flex-1 lg:min-h-0">
            {visibleParents.length === 0 && (
              <li className="text-xs text-zinc-500">Sin comentarios aún.</li>
            )}
            {visibleParents.map((c) => {
              const idx = pinIndex.get(c.id);
              const isActive = activeId === c.id || hoverId === c.id;
              const replies = repliesByParent.get(c.id) ?? [];
              const isOwn = c.userId === currentUserId;
              const isEditing = editId === c.id;
              return (
                <li
                  key={c.id}
                  onMouseEnter={() => setHoverId(c.id)}
                  onMouseLeave={() => setHoverId(null)}
                  className={`rounded-xl border bg-white p-3 text-sm transition ${
                    isActive ? "border-fuchsia-400 shadow-sm" : "divider"
                  } ${c.resolved ? "opacity-60" : ""}`}
                >
                  <CommentHead
                    c={c}
                    pinIdx={idx}
                    isOwn={isOwn}
                    onEdit={() => {
                      setEditId(c.id);
                      setEditBody(c.body);
                    }}
                    onDelete={() => deleteComment(c.id)}
                    onResolve={() => toggleResolve(c)}
                  />
                  {isEditing ? (
                    <EditBox
                      value={editBody}
                      onChange={setEditBody}
                      onSave={() => saveEdit(c.id)}
                      onCancel={() => setEditId(null)}
                      busy={busy}
                    />
                  ) : (
                    <p className="mt-1 whitespace-pre-wrap text-zinc-800">{c.body}</p>
                  )}

                  {replies.length > 0 && (
                    <ul className="mt-3 space-y-2 border-l-2 divider pl-3">
                      {replies.map((r) => {
                        const rOwn = r.userId === currentUserId;
                        const rEditing = editId === r.id;
                        return (
                          <li key={r.id} className="text-[13px]">
                            <CommentHead
                              c={r}
                              isReply
                              isOwn={rOwn}
                              onEdit={() => {
                                setEditId(r.id);
                                setEditBody(r.body);
                              }}
                              onDelete={() => deleteComment(r.id)}
                            />
                            {rEditing ? (
                              <EditBox
                                value={editBody}
                                onChange={setEditBody}
                                onSave={() => saveEdit(r.id)}
                                onCancel={() => setEditId(null)}
                                busy={busy}
                              />
                            ) : (
                              <p className="mt-0.5 whitespace-pre-wrap text-zinc-700">
                                {r.body}
                              </p>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {!c.resolved &&
                    (replyTo === c.id ? (
                      <div className="mt-2 flex gap-2">
                        <input
                          autoFocus
                          value={replyBody}
                          onChange={(e) => setReplyBody(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") setReplyTo(null);
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              sendReply(c.id);
                            }
                          }}
                          placeholder="Escribe una respuesta..."
                          className="flex-1 rounded-md input-soft px-2 py-1.5 text-[13px]"
                        />
                        <button
                          onClick={() => sendReply(c.id)}
                          disabled={busy || !replyBody.trim()}
                          className="btn-gradient rounded-md px-3 text-[12px] font-semibold disabled:opacity-60"
                        >
                          Enviar
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setReplyTo(c.id);
                          setReplyBody("");
                        }}
                        className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-zinc-500 hover:text-fuchsia-700"
                      >
                        <CornerDownRight className="h-3 w-3" />
                        Responder
                      </button>
                    ))}
                </li>
              );
            })}
          </ul>

          <form onSubmit={addComment} className="mt-3 flex gap-2">
            <input
              ref={commentInputRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Comentario general..."
              className="flex-1 rounded-lg input-soft px-3 py-2 text-sm"
            />
            <button
              disabled={busy || !body.trim()}
              className="btn-gradient rounded-lg px-4 text-sm font-semibold disabled:opacity-60"
            >
              Enviar
            </button>
          </form>
        </div>

        {canEdit && !isDeleted && (
          <button
            onClick={moveToTrash}
            disabled={busy}
            className="inline-flex items-center justify-center gap-1.5 self-start rounded-md px-3 py-1.5 text-[12px] font-medium text-zinc-500 transition hover:bg-rose-50 hover:text-rose-700 disabled:opacity-60"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Mover a papelera
          </button>
        )}
      </div>

      {versionModalOpen && (
        <NewVersionModal
          postId={postId}
          onClose={() => setVersionModalOpen(false)}
        />
      )}
    </div>
  );
}

function CommentHead({
  c,
  pinIdx,
  isReply,
  isOwn,
  onEdit,
  onDelete,
  onResolve,
}: {
  c: Comment;
  pinIdx?: number;
  isReply?: boolean;
  isOwn: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onResolve?: () => void;
}) {
  const [openMenu, setOpenMenu] = useState(false);
  const edited = c.updatedAt && c.updatedAt !== c.createdAt;
  return (
    <div className="flex items-start justify-between gap-2 text-xs">
      <div className="flex flex-wrap items-center gap-1.5 text-zinc-500">
        {pinIdx !== undefined && (
          <span
            className="grid h-4 w-4 flex-shrink-0 place-items-center rounded-full text-[9px] font-bold text-white"
            style={{
              background: c.resolved
                ? "#22c55e"
                : "linear-gradient(135deg,#3b5fff 0%,#8a2be2 35%,#ff4d8f 70%,#ff2d55 100%)",
            }}
          >
            {c.resolved ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : pinIdx}
          </span>
        )}
        <span
          className={`font-semibold ${isReply ? "text-zinc-700" : "brand-gradient-text"}`}
        >
          {c.userName}
        </span>
        <span>· {new Date(c.createdAt).toLocaleString()}</span>
        {edited && <span className="italic">(editado)</span>}
        {c.resolved && (
          <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
            Resuelto
          </span>
        )}
      </div>
      <div className="relative flex flex-shrink-0 items-center gap-1">
        {onResolve && !isReply && (
          <button
            onClick={onResolve}
            className={`rounded-md px-2 py-0.5 text-[10px] font-semibold transition ${
              c.resolved
                ? "text-emerald-700 hover:bg-emerald-50"
                : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
            }`}
            title={c.resolved ? "Marcar pendiente" : "Marcar como resuelto"}
          >
            {c.resolved ? "Reabrir" : "Resolver"}
          </button>
        )}
        {isOwn && (
          <button
            onClick={() => setOpenMenu((v) => !v)}
            className="grid h-5 w-5 place-items-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
            aria-label="Más"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        )}
        {openMenu && (
          <div
            className="absolute right-0 top-6 z-20 w-32 overflow-hidden rounded-lg border divider bg-white shadow-lg"
            onMouseLeave={() => setOpenMenu(false)}
          >
            <button
              onClick={() => {
                setOpenMenu(false);
                onEdit();
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-zinc-700 hover:bg-zinc-50"
            >
              <Pencil className="h-3 w-3" />
              Editar
            </button>
            <button
              onClick={() => {
                setOpenMenu(false);
                onDelete();
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-rose-600 hover:bg-rose-50"
            >
              <Trash2 className="h-3 w-3" />
              Borrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const STATUS_OPTIONS: { value: string; label: string; dot: string }[] = [
  { value: "draft", label: "Borrador", dot: "#71717a" },
  { value: "in_review", label: "En revisión", dot: "#f59e0b" },
  { value: "changes_requested", label: "Cambios solicitados", dot: "#f43f5e" },
  { value: "approved", label: "Aprobado", dot: "#10b981" },
  { value: "scheduled", label: "Programado", dot: "#3b82f6" },
  { value: "published", label: "Publicado", dot: "#a855f7" },
];

function StatusSelector({
  current,
  disabled,
  onChange,
}: {
  current: string;
  disabled: boolean;
  onChange: (s: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const cur = STATUS_OPTIONS.find((s) => s.value === current) ?? STATUS_OPTIONS[0];

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={ref} className="card relative p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        Estado
      </p>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="mt-1.5 flex w-full items-center justify-between gap-2 rounded-md border divider bg-white px-3 py-2 text-[13px] font-medium text-zinc-900 transition hover:border-zinc-300 disabled:opacity-60"
      >
        <span className="flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: cur.dot }}
          />
          {cur.label}
        </span>
        <span className="text-zinc-400">▾</span>
      </button>
      {open && (
        <div className="absolute left-3 right-3 top-full z-30 mt-1 overflow-hidden rounded-lg border divider bg-white shadow-lg">
          {STATUS_OPTIONS.map((opt) => {
            const active = opt.value === current;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (!active) onChange(opt.value);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition ${
                  active
                    ? "bg-zinc-50 font-semibold text-zinc-900"
                    : "text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: opt.dot }}
                />
                <span className="flex-1">{opt.label}</span>
                {active && <Check className="h-3.5 w-3.5 text-emerald-600" />}
              </button>
            );
          })}
        </div>
      )}
      <p className="mt-1.5 text-[10px] text-zinc-500">
        Override manual. El cliente sigue pudiendo aprobar/rechazar normalmente.
      </p>
    </div>
  );
}

function EditBox({
  value,
  onChange,
  onSave,
  onCancel,
  busy,
}: {
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <div className="mt-1.5 space-y-1.5">
      <textarea
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className="w-full rounded-md input-soft px-2 py-1.5 text-[13px]"
      />
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-md px-2 py-1 text-[11px] font-medium text-zinc-500 hover:text-zinc-900"
        >
          Cancelar
        </button>
        <button
          onClick={onSave}
          disabled={busy || !value.trim()}
          className="btn-gradient rounded-md px-3 py-1 text-[11px] font-semibold disabled:opacity-60"
        >
          Guardar
        </button>
      </div>
    </div>
  );
}
