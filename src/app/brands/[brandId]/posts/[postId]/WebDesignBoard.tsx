"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MentionInput from "@/components/MentionInput";
import MentionText from "@/components/MentionText";
import { useModKey } from "@/lib/platform";
import CommentAttachmentInline from "@/components/web-comments/CommentAttachmentInline";
import CommentComposer from "@/components/web-comments/CommentComposer";
import EditInline from "@/components/web-comments/EditInline";
import ReplyItem from "@/components/web-comments/ReplyItem";
import ThreadActions from "@/components/web-comments/ThreadActions";
import ShortcutsHelp from "@/components/web-comments/ShortcutsHelp";
import StatusSelector from "@/components/StatusSelector";
import { useMentionedRoles } from "@/lib/useMentionedRoles";

// Callback ref: focus al elemento sin scrollear el documento padre
function focusNoScrollRef(el: HTMLTextAreaElement | null) {
  if (el) el.focus({ preventScroll: true });
}

import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  CornerDownRight,
  Crosshair,
  ExternalLink,
  Globe,
  Loader2,
  MessageSquarePlus,
  Monitor,
  MoreHorizontal,
  Paperclip,
  Pencil,
  RefreshCcw,
  Search,
  Smartphone,
  Tablet,
  Trash2,
  X,
} from "lucide-react";

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
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentMime?: string | null;
  pageUrl?: string | null;
  selector?: string | null;
  viewportW?: number | null;
  viewportH?: number | null;
  scrollY?: number | null;
  assignedToId?: string | null;
  assignedToName?: string | null;
  internal?: boolean;
};

type BridgeState =
  | { state: "idle" }
  | { state: "connecting" }
  | { state: "ready"; pageUrl: string }
  | { state: "blocked"; reason: string };

type LiveViewport = {
  scrollY: number;
  scrollHeight: number;
  viewportW: number;
  viewportH: number;
};

export default function WebDesignBoard({
  postId,
  brandId,
  imageUrl,
  sourceUrl,
  widgetToken,
  initialComments,
  currentUserId,
  canComment,
  isAgency,
  postStatus,
}: {
  postId: string;
  brandId: string;
  imageUrl: string | null;
  sourceUrl: string | null;
  widgetToken: string | null;
  initialComments: Comment[];
  currentUserId: string;
  canComment: boolean;
  isAgency: boolean;
  postStatus: string;
}) {
  const [comments, setComments] = useState(initialComments);
  const [commentMode, setCommentMode] = useState(false);
  const [draft, setDraft] = useState<{
    x: number; // fracción del elemento [0,1]
    y: number;
    clientX: number; // posición visual en el overlay (pixels) para el popover
    clientY: number;
    pageUrl: string;
    selector: string | null;
    viewportW: number;
    viewportH: number;
    scrollY: number;
  } | null>(null);
  const [draftBody, setDraftBody] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  type FilterMode =
    | "all"
    | "pending"
    | "resolved"
    | "mine"
    | "awaiting"
    | "assigned_to_me"
    | "internal_only"
    | "public_only";
  const [filterMode, setFilterMode] = useState<FilterMode>("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [bridge, setBridge] = useState<BridgeState>({ state: "idle" });
  const [liveViewport, setLiveViewport] = useState<LiveViewport | null>(null);
  const [pinPositions, setPinPositions] = useState<
    Map<string, { clientX: number; clientY: number; found: boolean }>
  >(new Map());
  const [hoverRect, setHoverRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
    tagName: string;
  } | null>(null);
  const hoverThrottleRef = useRef(0);
  const modKey = useModKey();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [viewport, setViewport] = useState<"mobile" | "tablet" | "desktop">("desktop");
  const viewportWidth =
    viewport === "mobile" ? 390 : viewport === "tablet" ? 820 : null;
  type Attach = { url: string; name: string; mime: string };
  const [draftAttachment, setDraftAttachment] = useState<Attach | null>(null);
  const [replyAttachment, setReplyAttachment] = useState<Attach | null>(null);
  const [uploading, setUploading] = useState<"draft" | "reply" | null>(null);
  // Status del post mantenido en state (refleja cambios live sin recargar)
  const [liveStatus, setLiveStatus] = useState(postStatus);
  // Si el body del draft menciona a un cliente, no permitimos marcarlo como interno
  const { hasClientMention: draftHasClientMention } = useMentionedRoles(
    brandId,
    draftBody,
  );
  // Visibilidad automática según estado del post: si está en draft = interno (modo equipo).
  // Si ya está en revisión con cliente = público. El equipo no decide por cada comentario.
  const isInternalMode = isAgency && liveStatus === "draft";

  async function changeStatus(s: string) {
    // Si el equipo está cerrando "modo equipo" (draft → otro), advertir si quedan
    // notas internas sin resolver. Evita que se "olviden" al cambiar al modo cliente.
    if (liveStatus === "draft" && s !== "draft") {
      const pendingInternal = comments.filter(
        (c) => !c.parentId && c.internal && !c.resolved,
      ).length;
      if (pendingInternal > 0) {
        const ok = confirm(
          `Hay ${pendingInternal} ${
            pendingInternal === 1 ? "nota interna sin resolver" : "notas internas sin resolver"
          }. El cliente no las verá, pero quizás conviene atenderlas antes.\n\n¿Cambiar el estado de todos modos?`,
        );
        if (!ok) return;
      }
    }
    setBusy(true);
    const prev = liveStatus;
    setLiveStatus(s); // optimistic
    try {
      const res = await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: s }),
      });
      if (!res.ok) {
        setLiveStatus(prev); // revert
      }
    } finally {
      setBusy(false);
    }
  }
  const [replyTo, setReplyTo] = useState<
    { id: string; where: "popover" | "sidebar" } | null
  >(null);
  const [replyBody, setReplyBody] = useState("");
  const [editId, setEditId] = useState<
    { id: string; where: "popover" | "sidebar" } | null
  >(null);
  const [editBody, setEditBody] = useState("");
  const [iframeKey, setIframeKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const sidebarRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  const sidebarScrollRef = useRef<HTMLDivElement>(null);
  const draftInputRef = useRef<HTMLTextAreaElement>(null);
  const replyInputRef = useRef<HTMLTextAreaElement>(null);
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const captureResolversRef = useRef<
    Map<
      string,
      (
        v:
          | {
              ok: true;
              pageUrl: string;
              selector: string | null;
              elRect: { top: number; left: number; width: number; height: number } | null;
              viewportW: number;
              viewportH: number;
              scrollY: number;
            }
          | { ok: false; error: string },
      ) => void
    >
  >(new Map());

  const sourceOrigin = useMemo(() => {
    if (!sourceUrl) return null;
    try {
      return new URL(sourceUrl).origin;
    } catch {
      return null;
    }
  }, [sourceUrl]);

  const liveModeAvailable = !!sourceUrl && !!sourceOrigin && !!widgetToken;

  const parents = useMemo(
    () => comments.filter((c) => !c.parentId && c.x !== null && c.y !== null),
    [comments],
  );
  // repliesByParent se calcula más abajo, lo necesitamos antes para el filtro "awaiting"
  const repliesCountByParent = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of comments) {
      if (c.parentId) m.set(c.parentId, (m.get(c.parentId) ?? 0) + 1);
    }
    return m;
  }, [comments]);

  const visibleParents = useMemo(() => {
    let arr = parents;
    if (filterMode === "pending") arr = arr.filter((p) => !p.resolved);
    else if (filterMode === "resolved") arr = arr.filter((p) => p.resolved);
    else if (filterMode === "mine") arr = arr.filter((p) => p.userId === currentUserId);
    else if (filterMode === "assigned_to_me")
      arr = arr.filter((p) => p.assignedToId === currentUserId && !p.resolved);
    else if (filterMode === "internal_only")
      arr = arr.filter((p) => p.internal && !p.resolved);
    else if (filterMode === "public_only")
      arr = arr.filter((p) => !p.internal && !p.resolved);
    else if (filterMode === "awaiting")
      arr = arr.filter((p) => !p.resolved && (repliesCountByParent.get(p.id) ?? 0) === 0);
    // "all" → sin filtro
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      arr = arr.filter(
        (p) =>
          p.body.toLowerCase().includes(q) ||
          p.userName.toLowerCase().includes(q),
      );
    }
    return arr;
  }, [parents, filterMode, searchQuery, currentUserId, repliesCountByParent]);
  const pinIndex = useMemo(() => {
    const sorted = [...parents].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    return new Map(sorted.map((c, i) => [c.id, i + 1]));
  }, [parents]);

  // ============ Bridge: postMessage handshake con el widget ============
  useEffect(() => {
    if (!liveModeAvailable) return;
    function onMessage(ev: MessageEvent) {
      if (!sourceOrigin || ev.origin !== sourceOrigin) return;
      const data = ev.data as { mf?: string; [key: string]: unknown } | null;
      if (!data || typeof data !== "object" || !data.mf) return;
      if (data.mf === "ready") {
        const pageUrl =
          typeof data.pageUrl === "string" ? data.pageUrl : sourceUrl ?? "";
        setBridge({ state: "ready", pageUrl });
        setLiveViewport({
          scrollY: (data.scrollY as number) ?? 0,
          scrollHeight: (data.scrollHeight as number) ?? 0,
          viewportW: (data.viewportW as number) ?? 0,
          viewportH: (data.viewportH as number) ?? 0,
        });
        return;
      }
      if (data.mf === "viewport") {
        setLiveViewport({
          scrollY: (data.scrollY as number) ?? 0,
          scrollHeight: (data.scrollHeight as number) ?? 0,
          viewportW: (data.viewportW as number) ?? 0,
          viewportH: (data.viewportH as number) ?? 0,
        });
        return;
      }
      if (data.mf === "hover-rect") {
        const left = data.clientLeft as number | null;
        const top = data.clientTop as number | null;
        if (left == null || top == null) {
          setHoverRect(null);
        } else {
          setHoverRect({
            left,
            top,
            width: (data.width as number) ?? 0,
            height: (data.height as number) ?? 0,
            tagName: (data.tagName as string) ?? "",
          });
        }
        return;
      }
      if (data.mf === "pin-positions") {
        const positions = (data.positions as Array<{
          id: string;
          found: boolean;
          clientX: number | null;
          clientY: number | null;
        }>) ?? [];
        setPinPositions((cur) => {
          const next = new Map(cur);
          for (const p of positions) {
            if (p.clientX != null && p.clientY != null) {
              next.set(p.id, { clientX: p.clientX, clientY: p.clientY, found: p.found });
            } else {
              next.delete(p.id);
            }
          }
          return next;
        });
        return;
      }
      if (data.mf === "auth-failed") {
        setBridge({ state: "blocked", reason: "El widget rechazó el token" });
        return;
      }
      if (data.mf === "click-context-ok" || data.mf === "click-context-error") {
        const id = data.requestId as string | undefined;
        if (!id) return;
        const resolver = captureResolversRef.current.get(id);
        if (!resolver) return;
        captureResolversRef.current.delete(id);
        if (data.mf === "click-context-ok") {
          resolver({
            ok: true,
            pageUrl: (data.pageUrl as string) ?? "",
            selector: (data.selector as string) ?? null,
            elRect:
              (data.elRect as {
                top: number;
                left: number;
                width: number;
                height: number;
              } | null) ?? null,
            viewportW: (data.viewportW as number) ?? 0,
            viewportH: (data.viewportH as number) ?? 0,
            scrollY: (data.scrollY as number) ?? 0,
          });
        } else {
          resolver({ ok: false, error: (data.error as string) ?? "click context failed" });
        }
        return;
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [liveModeAvailable, sourceOrigin, sourceUrl]);

  // SSE: stream de comments en tiempo real (otros usuarios comentando, editando, resolviendo)
  useEffect(() => {
    if (!postId) return;
    const es = new EventSource(`/api/posts/${postId}/events`);
    es.addEventListener("comment", (ev) => {
      try {
        const c = JSON.parse((ev as MessageEvent).data) as Comment;
        setComments((arr) => (arr.some((x) => x.id === c.id) ? arr : [...arr, c]));
      } catch {}
    });
    es.addEventListener("comment_update", (ev) => {
      try {
        const u = JSON.parse((ev as MessageEvent).data) as {
          id: string;
          body: string;
          resolved: boolean;
          internal?: boolean;
          assignedToId?: string | null;
          assignedToName?: string | null;
          updatedAt: string;
        };
        setComments((arr) =>
          arr.map((c) =>
            c.id === u.id
              ? {
                  ...c,
                  body: u.body,
                  resolved: u.resolved,
                  internal: u.internal ?? c.internal,
                  updatedAt: u.updatedAt,
                  assignedToId: u.assignedToId ?? c.assignedToId,
                  assignedToName: u.assignedToName ?? c.assignedToName,
                }
              : c,
          ),
        );
      } catch {}
    });
    es.onerror = () => {
      // EventSource auto-reconecta; no hacemos nada
    };
    return () => es.close();
  }, [postId]);

  // Mandar al widget la lista de pines a trackear cuando cambian o cuando se conecta
  useEffect(() => {
    if (bridge.state !== "ready" || !sourceOrigin) return;
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    const pins = parents
      .filter((c) => c.selector)
      .map((c) => ({
        id: c.id,
        selector: c.selector,
        xInEl: c.x ?? 0.5,
        yInEl: c.y ?? 0.5,
        // Fallback si el selector no se encuentra (para que igual aparezca en algún lado)
        fallbackAbsoluteY:
          (c.scrollY ?? 0) + (c.y ?? 0.5) * (c.viewportH ?? 800),
        fallbackX: c.x ?? 0.5,
      }));
    iframe.contentWindow.postMessage(
      { mf: "track-pins", pins },
      sourceOrigin,
    );
  }, [parents, bridge.state, sourceOrigin]);

  // Saluda al widget cuando el iframe carga
  function onIframeLoad() {
    if (!liveModeAvailable || !sourceOrigin || !widgetToken) return;
    setBridge({ state: "connecting" });
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    iframe.contentWindow.postMessage(
      { mf: "hello", widgetToken, parentOrigin: window.location.origin },
      sourceOrigin,
    );
    // Timeout: si no responde en 6s, asumimos que el script no está
    setTimeout(() => {
      setBridge((cur) => {
        if (cur.state === "connecting") {
          return {
            state: "blocked",
            reason:
              "El widget no respondió. Verificá que el script esté instalado en el sitio o que el sitio permita ser embebido (sin X-Frame-Options).",
          };
        }
        return cur;
      });
    }, 6000);
  }

  function requestClickContext(clientX: number, clientY: number) {
    return new Promise<
      | {
          ok: true;
          pageUrl: string;
          selector: string | null;
          elRect: { top: number; left: number; width: number; height: number } | null;
          viewportW: number;
          viewportH: number;
          scrollY: number;
        }
      | { ok: false; error: string }
    >((resolve) => {
      const iframe = iframeRef.current;
      if (!iframe?.contentWindow || !sourceOrigin) {
        resolve({ ok: false, error: "iframe no disponible" });
        return;
      }
      const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      captureResolversRef.current.set(requestId, resolve);
      iframe.contentWindow.postMessage(
        { mf: "click-context", requestId, clientX, clientY },
        sourceOrigin,
      );
      setTimeout(() => {
        if (captureResolversRef.current.has(requestId)) {
          captureResolversRef.current.delete(requestId);
          resolve({ ok: false, error: "timeout esperando contexto" });
        }
      }, 4000);
    });
  }

  const submitDraft = useCallback(async (overrideInternal?: boolean) => {
    if (!draft || !draftBody.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: draftBody.trim(),
          x: draft.x,
          y: draft.y,
          pageUrl: draft.pageUrl,
          selector: draft.selector,
          viewportW: draft.viewportW,
          viewportH: draft.viewportH,
          scrollY: draft.scrollY,
          attachmentUrl: draftAttachment?.url ?? null,
          attachmentName: draftAttachment?.name ?? null,
          attachmentMime: draftAttachment?.mime ?? null,
          internal: overrideInternal ?? isInternalMode,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "No se pudo crear el comentario");
        return;
      }
      const j = await res.json();
      const created = j.comment as Comment;
      setComments((arr) => [...arr, created]);
      setDraft(null);
      setDraftBody("");
      setDraftAttachment(null);
      setCommentMode(false);
      setActiveId(created.id);
    } finally {
      setBusy(false);
    }
  }, [draft, draftBody, draftAttachment, isInternalMode, postId]);

  useEffect(() => {
    if (draft && draftInputRef.current) {
      draftInputRef.current.focus({ preventScroll: true });
    }
  }, [draft]);

  useEffect(() => {
    function isTyping(): boolean {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (el.isContentEditable) return true;
      return false;
    }
    function onKey(e: KeyboardEvent) {
      // Esc siempre funciona, incluso escribiendo (cierra cosas)
      if (e.key === "Escape") {
        if (helpOpen) {
          setHelpOpen(false);
        } else if (draft) {
          setDraft(null);
          setDraftBody("");
        } else if (commentMode) {
          setCommentMode(false);
        } else if (activeId) {
          setActiveId(null);
        } else if (sidebarOpen) {
          setSidebarOpen(false);
        }
        return;
      }
      // ⌘/Ctrl+Enter envía draft (funciona dentro del textarea)
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && draft && draftBody.trim()) {
        e.preventDefault();
        submitDraft();
        return;
      }
      // El resto de atajos solo si NO está typeando
      if (isTyping() || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "?" || (e.shiftKey && k === "/")) {
        e.preventDefault();
        setHelpOpen((v) => !v);
        return;
      }
      if (k === "c" && canComment && bridge.state === "ready") {
        e.preventDefault();
        setCommentMode((v) => !v);
        if (!commentMode) setDraft(null);
        return;
      }
      if (k === "r" && activeId) {
        e.preventDefault();
        const isOpen =
          replyTo?.id === activeId &&
          (replyTo.where === "popover" || replyTo.where === "sidebar");
        // Abre reply en el contexto donde está el thread (sidebar si abierto, popover si no)
        const where = sidebarOpen ? "sidebar" : "popover";
        setReplyTo(isOpen ? null : { id: activeId, where });
        setReplyBody("");
        return;
      }
      if (k === "j" || k === "k") {
        if (visibleParents.length === 0) return;
        e.preventDefault();
        const sorted = [...visibleParents].sort(
          (a, b) =>
            (pinIndex.get(a.id) ?? 0) - (pinIndex.get(b.id) ?? 0),
        );
        const currentIdx = activeId
          ? sorted.findIndex((p) => p.id === activeId)
          : -1;
        const nextIdx =
          k === "j"
            ? currentIdx < 0
              ? 0
              : Math.min(currentIdx + 1, sorted.length - 1)
            : currentIdx <= 0
              ? 0
              : currentIdx - 1;
        const target = sorted[nextIdx];
        if (target) selectThread(target.id);
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    draft,
    draftBody,
    commentMode,
    activeId,
    sidebarOpen,
    helpOpen,
    submitDraft,
    canComment,
    bridge.state,
    replyTo,
    visibleParents,
    pinIndex,
  ]);

  async function onOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!commentMode || !canComment) return;
    if (draft || capturing) return;
    if (bridge.state !== "ready") return;
    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (x < 0 || y < 0 || x > 1 || y > 1) return;
    setCapturing(true);
    setError(null);
    const iframeClientX = e.clientX - rect.left;
    const iframeClientY = e.clientY - rect.top;
    const result = await requestClickContext(iframeClientX, iframeClientY);
    setCapturing(false);
    if (!result.ok) {
      setError(`No se pudo anclar el comentario: ${result.error}`);
      return;
    }
    // Anclamos al elemento DOM clickeado: guardamos selector + offset relativo al elemento.
    // Así el pin sigue al elemento cuando la página reflowea (responsive, lazy load, etc).
    let xInEl = 0.5;
    let yInEl = 0.5;
    if (result.elRect && result.elRect.width > 0 && result.elRect.height > 0) {
      // elRect.top/left vienen en coords ABSOLUTAS del documento (incluyen scroll).
      // iframeClient(X,Y) son coords del viewport visible. Para igualar, sumamos scroll.
      const absoluteX = iframeClientX; // asumimos scrollX = 0 (raro tener scroll horizontal)
      const absoluteY = result.scrollY + iframeClientY;
      xInEl = (absoluteX - result.elRect.left) / result.elRect.width;
      yInEl = (absoluteY - result.elRect.top) / result.elRect.height;
      xInEl = Math.max(0, Math.min(1, xInEl));
      yInEl = Math.max(0, Math.min(1, yInEl));
    }
    setDraft({
      x: xInEl,
      y: yInEl,
      clientX: iframeClientX,
      clientY: iframeClientY,
      pageUrl: result.pageUrl,
      selector: result.selector,
      viewportW: Math.round(rect.width),
      viewportH: Math.round(rect.height),
      scrollY: result.scrollY,
    });
    setDraftBody("");
    setActiveId(null);
  }

  async function toggleResolved(c: Comment) {
    setBusy(true);
    try {
      const res = await fetch(`/api/comments/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolved: !c.resolved }),
      });
      if (res.ok) {
        const j = await res.json();
        setComments((arr) => arr.map((x) => (x.id === c.id ? { ...x, ...j.comment } : x)));
      }
    } finally {
      setBusy(false);
    }
  }

  async function uploadAttach(file: File, target: "draft" | "reply") {
    if (file.size > 25 * 1024 * 1024) {
      setError("El archivo no puede pesar más de 25MB");
      return;
    }
    setUploading(target);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/upload", { method: "POST", body: fd });
      if (!r.ok) {
        setError("No se pudo subir el archivo");
        return;
      }
      const j = await r.json();
      const att: Attach = {
        url: j.url,
        name: file.name,
        mime: file.type || "application/octet-stream",
      };
      if (target === "draft") setDraftAttachment(att);
      else setReplyAttachment(att);
    } finally {
      setUploading(null);
    }
  }

  async function submitReply(parentId: string) {
    if (!replyBody.trim() && !replyAttachment) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: replyBody.trim() || (replyAttachment ? "📎" : ""),
          parentId,
          attachmentUrl: replyAttachment?.url ?? null,
          attachmentName: replyAttachment?.name ?? null,
          attachmentMime: replyAttachment?.mime ?? null,
        }),
      });
      if (res.ok) {
        const j = await res.json();
        setComments((arr) =>
          arr.some((c) => c.id === j.comment.id) ? arr : [...arr, j.comment],
        );
        setReplyTo(null);
        setReplyBody("");
        setReplyAttachment(null);
      }
    } finally {
      setBusy(false);
    }
  }
  async function saveEdit(id: string) {
    if (!editBody.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/comments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: editBody.trim() }),
      });
      if (res.ok) {
        const j = await res.json();
        setComments((arr) =>
          arr.map((c) => (c.id === id ? { ...c, ...j.comment } : c)),
        );
        setEditId(null);
        setEditBody("");
      }
    } finally {
      setBusy(false);
    }
  }

  async function toggleInternal(c: Comment) {
    setBusy(true);
    try {
      const res = await fetch(`/api/comments/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ internal: !c.internal }),
      });
      if (res.ok) {
        const j = await res.json();
        setComments((arr) =>
          arr.map((x) => (x.id === c.id ? { ...x, ...j.comment } : x)),
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function assignComment(id: string, userId: string | null) {
    setBusy(true);
    try {
      const res = await fetch(`/api/comments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedToId: userId }),
      });
      if (res.ok) {
        const j = await res.json();
        setComments((arr) =>
          arr.map((c) => (c.id === id ? { ...c, ...j.comment } : c)),
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function deleteComment(id: string) {
    if (!confirm("¿Eliminar este comentario? No se puede deshacer.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/comments/${id}`, { method: "DELETE" });
      if (res.ok) {
        setComments((arr) => arr.filter((c) => c.id !== id && c.parentId !== id));
        if (activeId === id) setActiveId(null);
      }
    } finally {
      setBusy(false);
    }
  }

  // Agrupa replies por parentId
  const repliesByParent = useMemo(() => {
    const map = new Map<string, Comment[]>();
    for (const c of comments) {
      if (c.parentId) {
        const arr = map.get(c.parentId) ?? [];
        arr.push(c);
        map.set(c.parentId, arr);
      }
    }
    for (const arr of map.values()) {
      arr.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    }
    return map;
  }, [comments]);

  function selectThread(id: string) {
    setActiveId(id);
    // Si el drawer está abierto, lo cerramos para que veas el pin/popover sobre el iframe
    if (sidebarOpen) setSidebarOpen(false);
    // Scroll del SIDEBAR (no del documento) solo si el thread está fuera de vista
    const li = sidebarRefs.current.get(id);
    const container = sidebarScrollRef.current;
    if (li && container) {
      const liRect = li.getBoundingClientRect();
      const cRect = container.getBoundingClientRect();
      if (liRect.top < cRect.top) {
        container.scrollBy({ top: liRect.top - cRect.top, behavior: "smooth" });
      } else if (liRect.bottom > cRect.bottom) {
        container.scrollBy({ top: liRect.bottom - cRect.bottom, behavior: "smooth" });
      }
    }
    // Auto-scroll del iframe SOLO si el pin está fuera del viewport visible
    const c = comments.find((x) => x.id === id);
    if (!c?.selector) return;
    const pos = pinPositions.get(id);
    if (pos && liveViewport) {
      const isVisible =
        pos.clientY >= 10 &&
        pos.clientY <= liveViewport.viewportH - 10 &&
        pos.clientX >= 0 &&
        pos.clientX <= liveViewport.viewportW;
      if (isVisible) return; // Ya está a la vista, no scrolleamos
    }
    const iframe = iframeRef.current;
    if (iframe?.contentWindow && sourceOrigin) {
      iframe.contentWindow.postMessage(
        { mf: "scroll-to-selector", selector: c.selector },
        sourceOrigin,
      );
    }
  }

  function goToPin(c: Comment) {
    if (!c.selector || !sourceOrigin) return;
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    iframe.contentWindow.postMessage(
      { mf: "scroll-to-selector", selector: c.selector },
      sourceOrigin,
    );
  }

  // Set de pins cuyo elemento ya no existe en el DOM (selector no resuelve)
  const orphanIds = useMemo(() => {
    const set = new Set<string>();
    for (const [id, pos] of pinPositions) {
      if (!pos.found) set.add(id);
    }
    return set;
  }, [pinPositions]);

  // Indicadores de pins fuera de viewport (arriba/abajo)
  const offscreenCounts = useMemo(() => {
    if (!liveViewport) return { up: 0, down: 0 };
    let up = 0;
    let down = 0;
    for (const c of visibleParents) {
      const pos = pinPositions.get(c.id);
      if (!pos) continue;
      if (pos.clientY < 0) up++;
      else if (pos.clientY > liveViewport.viewportH) down++;
    }
    return { up, down };
  }, [visibleParents, pinPositions, liveViewport]);

  function gradientForName(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
    const palettes = [
      "from-blue-500 to-fuchsia-500",
      "from-fuchsia-500 to-rose-500",
      "from-emerald-500 to-teal-500",
      "from-amber-500 to-rose-500",
      "from-violet-500 to-blue-500",
    ];
    return palettes[Math.abs(hash) % palettes.length];
  }


  function reloadIframe() {
    setBridge({ state: "idle" });
    setIframeKey((k) => k + 1);
  }

  if (!liveModeAvailable) {
    return (
      <div className="card flex flex-col items-center gap-2 p-12 text-center text-zinc-500">
        <Globe className="h-8 w-8" />
        <p className="text-sm font-medium">
          {!sourceUrl
            ? "Falta la URL del sitio para revisar."
            : !widgetToken
              ? "La marca no tiene widget configurado."
              : "Live mode no disponible"}
        </p>
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-fuchsia-700 hover:underline"
          >
            Abrir sitio en pestaña nueva →
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="card overflow-hidden p-0">
      {/* Banner de modo equipo: aparece cuando el post está en draft (cliente no ve nada) */}
      {isInternalMode && (
        <div className="flex items-center gap-2 border-b border-violet-200 bg-violet-50 px-3 py-1.5 text-[12px] text-violet-900">
          <span className="text-base leading-none">🔒</span>
          <p className="flex-1 leading-tight">
            <span className="font-bold">Modo equipo.</span> Los comentarios nuevos quedan privados —
            el cliente no ve este entregable ni los comentarios. Cambiá el status a{" "}
            <span className="font-semibold">En revisión</span> cuando estén listos.
          </p>
        </div>
      )}
      {/* Topbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-3 py-2">
        <div className="flex items-center gap-2">
          {canComment && bridge.state === "ready" && (
            <button
              type="button"
              onClick={() => {
                setCommentMode((v) => !v);
                if (!commentMode) setDraft(null);
              }}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition ${
                commentMode
                  ? "bg-zinc-900 text-white shadow-sm ring-2 ring-fuchsia-300"
                  : "btn-gradient"
              }`}
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              {commentMode ? "Click sobre el sitio · Esc" : "Comentar"}
            </button>
          )}
          {(() => {
            const unresolved = parents.filter((p) => !p.resolved).length;
            return (
              <button
                type="button"
                onClick={() => setSidebarOpen((v) => !v)}
                className={`group inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition ${
                  unresolved > 0
                    ? "bg-gradient-to-br from-blue-500 via-fuchsia-500 to-rose-500 text-white shadow-sm hover:shadow-md"
                    : "btn-secondary"
                }`}
                title={`${parents.length} ${parents.length === 1 ? "comentario" : "comentarios"}`}
              >
                <MessageSquarePlus className="h-3.5 w-3.5" />
                Conversaciones
                {parents.length > 0 && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                      unresolved > 0
                        ? "bg-white/25 text-white"
                        : "bg-zinc-200 text-zinc-700"
                    }`}
                  >
                    {parents.length}
                  </span>
                )}
                {unresolved > 0 && (
                  <span className="relative ml-0.5 flex h-2 w-2">
                    <span className="absolute inset-0 animate-ping rounded-full bg-white/70" />
                    <span className="relative inline-block h-2 w-2 rounded-full bg-white" />
                  </span>
                )}
              </button>
            );
          })()}
        </div>
        <div className="flex items-center gap-2">
          {isAgency && (
            <StatusSelector
              current={liveStatus}
              disabled={busy}
              onChange={changeStatus}
              variant="compact"
              hideStatuses={["scheduled", "published"]}
            />
          )}
          {bridge.state === "ready" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Live
            </span>
          )}
          {bridge.state === "connecting" && (
            <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
              <Loader2 className="h-3 w-3 animate-spin" />
              Conectando widget…
            </span>
          )}
          {/* Toggle multi-device */}
          <div className="flex items-center gap-0.5 rounded-md bg-zinc-100 p-0.5 ring-1 ring-zinc-200">
            {(
              [
                { mode: "mobile" as const, Icon: Smartphone, title: "Mobile (390px)" },
                { mode: "tablet" as const, Icon: Tablet, title: "Tablet (820px)" },
                { mode: "desktop" as const, Icon: Monitor, title: "Desktop (100%)" },
              ]
            ).map(({ mode, Icon, title }) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewport(mode)}
                title={title}
                className={`grid h-6 w-7 place-items-center rounded transition ${
                  viewport === mode
                    ? "bg-white text-zinc-900 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-900"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="grid h-6 w-6 place-items-center rounded text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
            title="Atajos de teclado (?)"
          >
            <span className="font-mono text-[12px] font-bold">?</span>
          </button>
          <button
            type="button"
            onClick={reloadIframe}
            className="inline-flex items-center gap-1 text-[11.5px] font-medium text-zinc-600 hover:text-zinc-900"
            title="Recargar el iframe"
          >
            <RefreshCcw className="h-3 w-3" />
            Recargar
          </button>
          {sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-zinc-600 hover:text-zinc-900"
            >
              <ExternalLink className="h-3 w-3" />
              Abrir
            </a>
          )}
        </div>
      </div>

      <div className="relative">
        {/* Canvas: iframe live + overlay */}
        <div
          className={`relative max-h-[80vh] overflow-hidden ${
            viewportWidth ? "flex justify-center bg-zinc-100 py-4" : "bg-zinc-50"
          }`}
        >
          {/* Wrapper interno con el ancho del viewport elegido. Overlay y pines viven
              acá adentro para coincidir con el iframe. */}
          <div
            className="relative"
            style={
              viewportWidth
                ? { width: `${viewportWidth}px`, maxWidth: "100%" }
                : { width: "100%" }
            }
          >
          <iframe
            key={iframeKey}
            ref={iframeRef}
            src={sourceUrl ?? undefined}
            onLoad={onIframeLoad}
            style={
              viewportWidth
                ? { boxShadow: "0 8px 32px -12px rgba(0,0,0,0.25)" }
                : undefined
            }
            className="block h-[80vh] w-full border-0 bg-white transition-[width] duration-200"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals"
            referrerPolicy="no-referrer-when-downgrade"
          />

          {/* Overlay para capturar clicks (solo en commentMode) */}
          {bridge.state === "ready" && commentMode && canComment && !draft && (
            <div
              onClick={onOverlayClick}
              onMouseMove={(e) => {
                const now = Date.now();
                if (now - hoverThrottleRef.current < 30) return;
                hoverThrottleRef.current = now;
                const target = e.currentTarget;
                const rect = target.getBoundingClientRect();
                const iframeClientX = e.clientX - rect.left;
                const iframeClientY = e.clientY - rect.top;
                const iframe = iframeRef.current;
                if (iframe?.contentWindow && sourceOrigin) {
                  iframe.contentWindow.postMessage(
                    {
                      mf: "hover-component",
                      clientX: iframeClientX,
                      clientY: iframeClientY,
                    },
                    sourceOrigin,
                  );
                }
              }}
              onMouseLeave={() => setHoverRect(null)}
              className={`absolute inset-0 z-10 ${
                capturing ? "cursor-wait" : "cursor-crosshair"
              }`}
              style={{ background: "rgba(138,43,226,0.02)" }}
            >
              {/* Highlight del componente bajo el cursor */}
              {hoverRect && !capturing && (
                <div
                  className="pointer-events-none absolute rounded ring-2 ring-fuchsia-500"
                  style={{
                    left: `${hoverRect.left}px`,
                    top: `${hoverRect.top}px`,
                    width: `${hoverRect.width}px`,
                    height: `${hoverRect.height}px`,
                    background: "rgba(217,70,239,0.10)",
                    boxShadow: "0 0 0 2px rgba(255,255,255,0.5)",
                  }}
                >
                  <span className="absolute -top-5 left-0 rounded bg-fuchsia-600 px-1.5 py-0.5 font-mono text-[9.5px] font-bold uppercase text-white">
                    {hoverRect.tagName}
                  </span>
                </div>
              )}
              <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-zinc-900 px-3 py-1 text-[11px] font-semibold text-white shadow-lg">
                {capturing ? "Anclando…" : "Click sobre el componente · Esc para salir"}
              </div>
            </div>
          )}

          {/* Pines existentes — el widget calcula su posición real basado en el selector
              del elemento al que se anclaron. Si el sitio reflowea (responsive, lazy load),
              los pines siguen al elemento. Si el elemento ya no existe (sitio cambió),
              el pin se marca visualmente como "huérfano". */}
          {liveViewport && visibleParents.map((c) => {
            const idx = pinIndex.get(c.id) ?? 0;
            const active = activeId === c.id || hoverId === c.id;
            const pos = pinPositions.get(c.id);
            if (!pos) return null;
            const isOffscreen =
              pos.clientY < -20 ||
              pos.clientY > liveViewport.viewportH + 20 ||
              pos.clientX < -20 ||
              pos.clientX > liveViewport.viewportW + 20;
            const orphan = !pos.found;
            return (
              <button
                key={c.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  selectThread(c.id);
                }}
                onMouseEnter={() => setHoverId(c.id)}
                onMouseLeave={() => setHoverId(null)}
                style={{
                  left: `${pos.clientX}px`,
                  top: `${pos.clientY}px`,
                  display: isOffscreen ? "none" : undefined,
                }}
                className={`absolute z-20 -translate-x-1/2 -translate-y-1/2 grid h-7 w-7 place-items-center rounded-full text-[11px] font-bold text-white shadow-md ring-2 transition ${
                  active ? "scale-125" : ""
                } ${
                  c.resolved
                    ? "bg-emerald-500 ring-white"
                    : orphan
                      ? "bg-amber-500 ring-amber-100"
                      : c.internal
                        ? "bg-violet-600 ring-violet-100"
                        : "bg-gradient-to-br from-blue-500 via-fuchsia-500 to-rose-500 ring-white"
                }`}
                title={
                  orphan
                    ? `⚠ Elemento no encontrado — ${c.body.slice(0, 80)}`
                    : c.body.slice(0, 80)
                }
              >
                {c.resolved ? (
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                ) : orphan ? (
                  <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2.5} />
                ) : (
                  idx
                )}
              </button>
            );
          })}

          {/* Hover preview: mini-tarjeta flotante al pasar el mouse sobre un pin */}
          {hoverId && hoverId !== activeId && liveViewport && (() => {
            const c = parents.find((p) => p.id === hoverId);
            if (!c) return null;
            const pos = pinPositions.get(c.id);
            if (!pos) return null;
            const showRight = pos.clientX < liveViewport.viewportW * 0.6;
            return (
              <div
                className="pointer-events-none absolute z-30"
                style={{
                  left: `${pos.clientX + (showRight ? 22 : -22)}px`,
                  top: `${pos.clientY}px`,
                  transform: showRight ? "translateY(-50%)" : "translate(-100%, -50%)",
                }}
              >
                <div className="max-w-[260px] rounded-lg bg-zinc-900/95 px-2.5 py-2 text-white shadow-xl backdrop-blur-md">
                  <p className="text-[10.5px] font-semibold opacity-80">{c.userName}</p>
                  <p className="mt-0.5 line-clamp-3 text-[12.5px] leading-snug">{c.body}</p>
                </div>
              </div>
            );
          })()}

          {/* Click popover: tarjeta con acciones cuando seleccionás un pin.
              Max-height con scroll interno para que no crezca fuera del viewport y
              clamp del top para que siempre quede visible aunque el pin esté en un borde. */}
          {activeId && !draft && liveViewport && (() => {
            const c = parents.find((p) => p.id === activeId);
            if (!c) return null;
            const pos = pinPositions.get(c.id);
            if (!pos) return null;
            const showRight = pos.clientX < liveViewport.viewportW * 0.55;
            const margin = 16;
            const maxAvailable =
              2 * Math.min(pos.clientY - margin, liveViewport.viewportH - pos.clientY - margin);
            // Max-height: tope para que no salga del viewport. La altura real es la natural
            // del contenido (popover chico si hay poco, crece hasta este tope si hay mucho).
            const popoverMaxH = Math.min(440, maxAvailable);
            const topClamped = Math.max(
              popoverMaxH / 2 + margin,
              Math.min(pos.clientY, liveViewport.viewportH - popoverMaxH / 2 - margin),
            );
            return (
              <div
                className="absolute z-40"
                style={{
                  left: `${pos.clientX + (showRight ? 24 : -24)}px`,
                  top: `${topClamped}px`,
                  transform: showRight ? "translateY(-50%)" : "translate(-100%, -50%)",
                }}
              >
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{ maxHeight: `${popoverMaxH}px` }}
                  className="flex w-72 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl"
                >
                  {/* Header fijo */}
                  <div className="flex items-start justify-between gap-2 border-b border-zinc-100 p-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br ${gradientForName(
                          c.userName,
                        )} text-[11px] font-bold text-white`}
                      >
                        {c.userName[0]?.toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-semibold text-zinc-900">
                          {c.userName}
                        </p>
                        <p className="text-[10px] text-zinc-500">
                          {new Date(c.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveId(null)}
                      className="grid h-6 w-6 place-items-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                      aria-label="Cerrar"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Body scrolleable */}
                  <div className="flex-1 overflow-y-auto px-3 pt-2 pb-2">
                  {orphanIds.has(c.id) && (
                    <div className="mb-2 flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-[10.5px] text-amber-900 ring-1 ring-amber-100">
                      <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />
                      <span>
                        El componente al que está anclado este pin ya no existe en el sitio. Puede
                        haber cambiado o eliminado.
                      </span>
                    </div>
                  )}
                  {editId?.id === c.id && editId.where === "popover" ? (
                    <EditInline
                      brandId={brandId}
                      value={editBody}
                      onChange={setEditBody}
                      onSave={() => saveEdit(c.id)}
                      onCancel={() => {
                        setEditId(null);
                        setEditBody("");
                      }}
                      busy={busy}
                      rows={3}
                    />
                  ) : (
                    <>
                      <p className="mt-2 whitespace-pre-wrap text-[13px] leading-snug text-zinc-800">
                        <MentionText text={c.body} />
                        {c.updatedAt && c.updatedAt !== c.createdAt && (
                          <span className="ml-1 text-[10px] italic text-zinc-400">
                            (editado)
                          </span>
                        )}
                      </p>
                      <CommentAttachmentInline
                        url={c.attachmentUrl}
                        name={c.attachmentName}
                        mime={c.attachmentMime}
                      />
                    </>
                  )}

                  {/* Replies dentro del popover sobre el pin */}
                  {(repliesByParent.get(c.id) ?? []).length > 0 && (
                    <ul className="mt-2.5 space-y-1.5 border-l-2 border-zinc-100 pl-2.5">
                      {(repliesByParent.get(c.id) ?? []).map((r) => (
                        <ReplyItem
                          key={r.id}
                          reply={r}
                          currentUserId={currentUserId}
                          brandId={brandId}
                          editing={editId?.id === r.id && editId.where === "popover"}
                          editBody={editBody}
                          onEditBodyChange={setEditBody}
                          onStartEdit={() => {
                            setEditId({ id: r.id, where: "popover" });
                            setEditBody(r.body);
                          }}
                          onCancelEdit={() => {
                            setEditId(null);
                            setEditBody("");
                          }}
                          onSaveEdit={() => saveEdit(r.id)}
                          onDelete={() => deleteComment(r.id)}
                          busy={busy}
                          gradientForName={gradientForName}
                        />
                      ))}
                    </ul>
                  )}

                  </div>
                  {/* Reply input FIJO encima del footer — siempre visible al activar Responder */}
                  {replyTo?.id === c.id && replyTo.where === "popover" && (
                    <div className="border-t border-zinc-100 bg-zinc-50/50 p-3">
                      <CommentComposer
                        brandId={brandId}
                        value={replyBody}
                        onChange={setReplyBody}
                        attachment={replyAttachment}
                        onAttachmentChange={setReplyAttachment}
                        uploading={uploading === "reply"}
                        onUpload={(f) => uploadAttach(f, "reply")}
                        onSubmit={() => submitReply(c.id)}
                        onCancel={() => {
                          setReplyTo(null);
                          setReplyBody("");
                          setReplyAttachment(null);
                        }}
                        busy={busy}
                        rows={2}
                        placeholder="Tu respuesta…"
                        submitLabel="Responder"
                        modKey={modKey}
                        autoFocusNoScroll
                        variant="compact"
                      />
                    </div>
                  )}
                  <ThreadActions
                    brandId={brandId}
                    resolved={c.resolved}
                    isOwn={c.userId === currentUserId}
                    isReplyActive={replyTo?.id === c.id && replyTo.where === "popover"}
                    busy={busy}
                    goLabel="Ir"
                    assignedToId={c.assignedToId}
                    assignedToName={c.assignedToName}
                    canAssign={canComment}
                    gradientForName={gradientForName}
                    internal={c.internal}
                    onToggleInternal={isAgency ? () => toggleInternal(c) : undefined}
                    onToggleResolved={() => toggleResolved(c)}
                    onToggleReply={() => {
                      const isOpen =
                        replyTo?.id === c.id && replyTo.where === "popover";
                      setReplyTo(isOpen ? null : { id: c.id, where: "popover" });
                      setReplyBody("");
                    }}
                    onGoToPin={() => goToPin(c)}
                    onAssign={(uid) => assignComment(c.id, uid)}
                    onEdit={
                      editId?.id === c.id && editId.where === "popover"
                        ? undefined
                        : () => {
                            setEditId({ id: c.id, where: "popover" });
                            setEditBody(c.body);
                          }
                    }
                    onDelete={() => deleteComment(c.id)}
                  />
                </div>
              </div>
            );
          })()}

          {/* Draft popover — posicionado en el px exacto del click (no scrollea con iframe
              porque el usuario está escribiendo, no se espera que scrollee) */}
          {draft && (
            <div
              style={{ left: `${draft.clientX}px`, top: `${draft.clientY}px` }}
              className="absolute z-30 -translate-x-1/2 -translate-y-1/2"
            >
              <span className="grid h-7 w-7 place-items-center rounded-full bg-fuchsia-600 text-[11px] font-bold text-white shadow-md ring-2 ring-white">
                {parents.length + 1}
              </span>
              <div
                onClick={(e) => e.stopPropagation()}
                className={`absolute mt-2 w-72 rounded-xl border border-zinc-200 bg-white p-2.5 shadow-xl ${
                  liveViewport && draft.clientX > liveViewport.viewportW * 0.7
                    ? "right-0"
                    : "left-0"
                }`}
              >
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <p className="text-[10.5px] font-semibold uppercase tracking-wider text-zinc-500">
                    Comentario en vivo
                  </p>
                  {isInternalMode && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-700 ring-1 ring-violet-200"
                      title="Este entregable está en modo equipo. Cuando cambies el status a 'En revisión' los comentarios nuevos serán visibles al cliente."
                    >
                      🔒 Equipo
                    </span>
                  )}
                </div>
                <CommentComposer
                  brandId={brandId}
                  value={draftBody}
                  onChange={setDraftBody}
                  attachment={draftAttachment}
                  onAttachmentChange={setDraftAttachment}
                  uploading={uploading === "draft"}
                  onUpload={(f) => uploadAttach(f, "draft")}
                  onSubmit={() => submitDraft()}
                  onSubmitInternal={
                    isAgency && !isInternalMode ? () => submitDraft(true) : undefined
                  }
                  internalDisabled={draftHasClientMention}
                  internalDisabledReason="Mencionaste a un cliente — no se puede marcar como interno (necesita verlo)"
                  onCancel={() => {
                    setDraft(null);
                    setDraftBody("");
                    setDraftAttachment(null);
                    setError(null);
                  }}
                  busy={busy}
                  rows={3}
                  placeholder="Tu comentario…"
                  modKey={modKey}
                  textareaRef={draftInputRef}
                />
                {error && <p className="mt-1 text-[11px] text-rose-600">{error}</p>}
              </div>
            </div>
          )}

          {/* Indicadores de pins fuera del viewport */}
          {liveViewport && bridge.state === "ready" && (offscreenCounts.up > 0 || offscreenCounts.down > 0) && (
            <>
              {offscreenCounts.up > 0 && (
                <div className="pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-zinc-900/90 px-2.5 py-1 text-[10.5px] font-semibold text-white shadow-lg backdrop-blur-md">
                    <ArrowUp className="h-3 w-3" />
                    {offscreenCounts.up} {offscreenCounts.up === 1 ? "comentario arriba" : "comentarios arriba"}
                  </span>
                </div>
              )}
              {offscreenCounts.down > 0 && (
                <div className="pointer-events-none absolute bottom-3 left-1/2 z-30 -translate-x-1/2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-zinc-900/90 px-2.5 py-1 text-[10.5px] font-semibold text-white shadow-lg backdrop-blur-md">
                    <ArrowDown className="h-3 w-3" />
                    {offscreenCounts.down} {offscreenCounts.down === 1 ? "comentario abajo" : "comentarios abajo"}
                  </span>
                </div>
              )}
            </>
          )}

          {/* Estado bloqueado */}
          {bridge.state === "blocked" && (
            <div className="absolute inset-0 z-40 flex items-start justify-center bg-white/95 p-6">
              <div className="max-w-lg rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-amber-100 ring-1 ring-amber-200">
                    <AlertTriangle className="h-4 w-4 text-amber-700" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-zinc-900">
                      No pudimos conectar con el widget
                    </p>
                    <p className="mt-1 text-[12px] text-zinc-600">{bridge.reason}</p>
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-[12px] text-zinc-700">
                      <li>
                        Verificá que el script <span className="font-mono">widget.js</span> esté
                        pegado en el sitio.
                      </li>
                      <li>
                        Si el sitio devuelve <span className="font-mono">X-Frame-Options: DENY</span>
                        {" "}o <span className="font-mono">CSP frame-ancestors</span>, no se puede
                        embeber. Probá con staging.
                      </li>
                      <li>
                        Si todo está bien, tocá <strong>Recargar</strong> arriba.
                      </li>
                    </ul>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={reloadIframe}
                        className="btn-gradient inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold"
                      >
                        <RefreshCcw className="h-3.5 w-3.5" />
                        Reintentar
                      </button>
                      {sourceUrl && (
                        <a
                          href={sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-secondary inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Abrir en pestaña
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          </div>
        </div>

        {/* Drawer flotante (slide-in desde la derecha) */}
        {sidebarOpen && (
          <div
            className="absolute inset-0 z-40 bg-zinc-900/20 backdrop-blur-[2px]"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <aside
          className={`absolute right-0 top-0 bottom-0 z-50 w-[400px] max-w-[90vw] border-l border-zinc-200 bg-zinc-50/95 shadow-2xl backdrop-blur-md transition-transform duration-200 ${
            sidebarOpen ? "translate-x-0" : "translate-x-full pointer-events-none"
          }`}
        >
          {/* Header del drawer */}
          <div className="border-b border-zinc-100 bg-white">
            <div className="flex items-center justify-between gap-2 px-3 pt-2.5 pb-2">
              <div className="flex items-center gap-2">
                <h3 className="text-[14px] font-bold text-zinc-900">Conversaciones</h3>
                {parents.length > 0 && (
                  <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums text-zinc-600">
                    {visibleParents.length}
                    {visibleParents.length !== parents.length && (
                      <span className="text-zinc-400"> / {parents.length}</span>
                    )}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="grid h-7 w-7 place-items-center rounded text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {parents.length > 0 && (
              <>
                {/* Searchbox */}
                <div className="px-3 pb-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Buscar por texto o autor…"
                      className="w-full rounded-md border border-zinc-200 bg-white pl-7 pr-7 py-1.5 text-[12px] focus:border-fuchsia-400 focus:outline-none"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery("")}
                        className="absolute right-1.5 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                        aria-label="Limpiar búsqueda"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
                {/* Filtros pills */}
                <div className="flex items-center gap-1 overflow-x-auto px-3 pb-2.5">
                  {(() => {
                    const counts = {
                      all: parents.length,
                      pending: parents.filter((p) => !p.resolved).length,
                      resolved: parents.filter((p) => p.resolved).length,
                      mine: parents.filter((p) => p.userId === currentUserId).length,
                      assigned_to_me: parents.filter(
                        (p) => p.assignedToId === currentUserId && !p.resolved,
                      ).length,
                      internal_only: parents.filter((p) => p.internal && !p.resolved).length,
                      public_only: parents.filter((p) => !p.internal && !p.resolved).length,
                      awaiting: parents.filter(
                        (p) => !p.resolved && (repliesCountByParent.get(p.id) ?? 0) === 0,
                      ).length,
                    };
                    const filters: { key: FilterMode; label: string; count: number }[] = [
                      { key: "pending", label: "Pendientes", count: counts.pending },
                      {
                        key: "assigned_to_me",
                        label: "Asignados a mí",
                        count: counts.assigned_to_me,
                      },
                      ...(isAgency
                        ? ([
                            {
                              key: "internal_only" as FilterMode,
                              label: "🔒 Solo equipo",
                              count: counts.internal_only,
                            },
                            {
                              key: "public_only" as FilterMode,
                              label: "🌍 Cliente",
                              count: counts.public_only,
                            },
                          ] as const)
                        : []),
                      { key: "awaiting", label: "Sin responder", count: counts.awaiting },
                      { key: "mine", label: "Míos", count: counts.mine },
                      { key: "resolved", label: "Resueltos", count: counts.resolved },
                      { key: "all", label: "Todos", count: counts.all },
                    ];
                    return filters.map((f) => {
                      const active = filterMode === f.key;
                      return (
                        <button
                          key={f.key}
                          type="button"
                          onClick={() => setFilterMode(f.key)}
                          className={`flex flex-shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                            active
                              ? "bg-zinc-900 text-white"
                              : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                          }`}
                        >
                          {f.label}
                          {f.count > 0 && (
                            <span
                              className={`rounded-full px-1 text-[9.5px] font-bold tabular-nums ${
                                active ? "bg-white/25 text-white" : "bg-white text-zinc-600"
                              }`}
                            >
                              {f.count}
                            </span>
                          )}
                        </button>
                      );
                    });
                  })()}
                </div>
              </>
            )}
          </div>
          <div
            ref={sidebarScrollRef}
            className="overflow-y-auto p-3"
            style={{ maxHeight: "calc(80vh - 140px)" }}
          >
            {visibleParents.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-2 py-10 text-center">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-white ring-1 ring-zinc-200">
                  <MessageSquarePlus className="h-4 w-4 text-zinc-400" />
                </span>
                <p className="text-[12.5px] font-semibold text-zinc-700">
                  {parents.length === 0
                    ? "Sin comentarios todavía"
                    : searchQuery.trim()
                      ? "Sin resultados para tu búsqueda"
                      : filterMode === "pending"
                        ? "Todo resuelto 🎉"
                        : filterMode === "resolved"
                          ? "Aún no hay resueltos"
                          : filterMode === "mine"
                            ? "No tenés comentarios propios"
                            : filterMode === "assigned_to_me"
                              ? "Nada asignado a vos 🎉"
                              : filterMode === "internal_only"
                                ? "Sin notas internas del equipo"
                                : filterMode === "public_only"
                                  ? "Sin comentarios públicos del cliente"
                                  : filterMode === "awaiting"
                                    ? "Todo respondido"
                                    : "Nada por acá"}
                </p>
                {canComment && parents.length === 0 && bridge.state === "ready" && (
                  <p className="text-[11px] text-zinc-500">
                    Tocá <span className="font-medium">Comentar</span> y hacé click sobre cualquier
                    componente del sitio para anclar feedback.
                  </p>
                )}
                {parents.length > 0 && (filterMode !== "pending" || searchQuery.trim()) && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilterMode("pending");
                      setSearchQuery("");
                    }}
                    className="text-[11px] font-semibold text-fuchsia-700 hover:underline"
                  >
                    Limpiar filtros
                  </button>
                )}
              </div>
            ) : (
              <ul className="space-y-2">
                {visibleParents
                  .slice()
                  .sort((a, b) => (pinIndex.get(a.id) ?? 0) - (pinIndex.get(b.id) ?? 0))
                  .map((c) => {
                    const idx = pinIndex.get(c.id) ?? 0;
                    const active = activeId === c.id;
                    let host = "";
                    if (c.pageUrl) {
                      try {
                        host = new URL(c.pageUrl).host.replace(/^www\./, "");
                      } catch {}
                    }
                    // Extraer "tag HTML" del selector (ej. "div.card > button.btn-primary" → "BUTTON")
                    const componentTag = (() => {
                      if (!c.selector) return null;
                      const last = c.selector.split(">").pop()?.trim() ?? "";
                      const m = last.match(/^([a-z][a-z0-9]*)/i);
                      return m ? m[1].toUpperCase() : null;
                    })();
                    return (
                      <li
                        key={c.id}
                        ref={(node) => {
                          if (node) sidebarRefs.current.set(c.id, node);
                          else sidebarRefs.current.delete(c.id);
                        }}
                        onMouseEnter={() => setHoverId(c.id)}
                        onMouseLeave={() => setHoverId(null)}
                        onClick={() => selectThread(c.id)}
                        className={`group cursor-pointer rounded-xl border p-3 transition ${
                          c.internal
                            ? "border-violet-200 bg-violet-50/40"
                            : "bg-white border-zinc-200"
                        } ${
                          active
                            ? "shadow-md ring-2 ring-fuchsia-200 !border-fuchsia-400"
                            : "hover:border-zinc-300 hover:shadow-sm"
                        } ${c.resolved ? "opacity-60" : ""}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <span
                              className={`grid h-8 w-8 flex-shrink-0 place-items-center rounded-full text-[12px] font-bold text-white shadow-sm ${
                                c.resolved
                                  ? "bg-emerald-500"
                                  : `bg-gradient-to-br ${gradientForName(c.userName)}`
                              }`}
                            >
                              {c.resolved ? (
                                <Check className="h-3.5 w-3.5" strokeWidth={3} />
                              ) : (
                                c.userName[0]?.toUpperCase()
                              )}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-[12.5px] font-semibold text-zinc-900">
                                {c.userName}
                              </p>
                              <p className="text-[10px] text-zinc-500">
                                {new Date(c.createdAt).toLocaleString([], {
                                  day: "numeric",
                                  month: "short",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </p>
                            </div>
                          </div>
                          <span
                            className={`flex-shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white shadow-sm ${
                              c.resolved
                                ? "bg-emerald-500"
                                : "bg-gradient-to-br from-blue-500 via-fuchsia-500 to-rose-500"
                            }`}
                            title={`Pin #${idx}`}
                          >
                            #{idx}
                          </span>
                          {c.internal && (
                            <span
                              className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-violet-700 ring-1 ring-violet-200"
                              title="Comentario interno — solo lo ve el equipo, no el cliente"
                            >
                              🔒 equipo
                            </span>
                          )}
                          {orphanIds.has(c.id) && (
                            <span
                              className="grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700 ring-1 ring-amber-200"
                              title="El componente al que apunta ya no existe"
                            >
                              <AlertTriangle className="h-3 w-3" />
                            </span>
                          )}
                        </div>

                        {/* Body / edit inline */}
                        {editId?.id === c.id && editId.where === "sidebar" ? (
                          <div onClick={(e) => e.stopPropagation()}>
                            <EditInline
                              brandId={brandId}
                              value={editBody}
                              onChange={setEditBody}
                              onSave={() => saveEdit(c.id)}
                              onCancel={() => {
                                setEditId(null);
                                setEditBody("");
                              }}
                              busy={busy}
                              rows={3}
                            />
                          </div>
                        ) : (
                          <>
                            <p className="mt-2 whitespace-pre-wrap text-[13px] leading-snug text-zinc-800">
                              <MentionText text={c.body} />
                              {c.updatedAt && c.updatedAt !== c.createdAt && (
                                <span className="ml-1 text-[10px] italic text-zinc-400">
                                  (editado)
                                </span>
                              )}
                            </p>
                            <CommentAttachmentInline
                              url={c.attachmentUrl}
                              name={c.attachmentName}
                              mime={c.attachmentMime}
                            />
                          </>
                        )}

                        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-zinc-400">
                          {componentTag && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-violet-700 ring-1 ring-violet-100">
                              {componentTag}
                            </span>
                          )}
                          {host && (
                            <a
                              href={c.pageUrl ?? undefined}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="font-mono text-violet-700 hover:underline"
                            >
                              {host}
                            </a>
                          )}
                        </div>

                        {/* Replies del thread */}
                        {(repliesByParent.get(c.id) ?? []).length > 0 && (
                          <ul
                            className="mt-2.5 space-y-1.5 border-l-2 border-zinc-100 pl-2.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {(repliesByParent.get(c.id) ?? []).map((r) => (
                              <ReplyItem
                                key={r.id}
                                reply={r}
                                currentUserId={currentUserId}
                                brandId={brandId}
                                editing={editId?.id === r.id && editId.where === "sidebar"}
                                editBody={editBody}
                                onEditBodyChange={setEditBody}
                                onStartEdit={() => {
                                  setEditId({ id: r.id, where: "sidebar" });
                                  setEditBody(r.body);
                                }}
                                onCancelEdit={() => {
                                  setEditId(null);
                                  setEditBody("");
                                }}
                                onSaveEdit={() => saveEdit(r.id)}
                                onDelete={() => deleteComment(r.id)}
                                busy={busy}
                                gradientForName={gradientForName}
                              />
                            ))}
                          </ul>
                        )}

                        {/* Input de respuesta */}
                        {replyTo?.id === c.id && replyTo.where === "sidebar" ? (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="mt-2.5"
                          >
                            <CommentComposer
                              brandId={brandId}
                              value={replyBody}
                              onChange={setReplyBody}
                              attachment={replyAttachment}
                              onAttachmentChange={setReplyAttachment}
                              uploading={uploading === "reply"}
                              onUpload={(f) => uploadAttach(f, "reply")}
                              onSubmit={() => submitReply(c.id)}
                              onCancel={() => {
                                setReplyTo(null);
                                setReplyBody("");
                                setReplyAttachment(null);
                              }}
                              busy={busy}
                              rows={2}
                              placeholder="Tu respuesta…"
                              submitLabel="Responder"
                              modKey={modKey}
                              autoFocusNoScroll
                              variant="compact"
                            />
                          </div>
                        ) : null}

                        <div onClick={(e) => e.stopPropagation()} className="mt-2.5 -mx-3 -mb-3">
                          <ThreadActions
                            brandId={brandId}
                            resolved={c.resolved}
                            isOwn={c.userId === currentUserId}
                            isReplyActive={replyTo?.id === c.id && replyTo.where === "sidebar"}
                            busy={busy}
                            goLabel="Ir al pin"
                            assignedToId={c.assignedToId}
                            assignedToName={c.assignedToName}
                            canAssign={canComment}
                            gradientForName={gradientForName}
                            internal={c.internal}
                            onToggleInternal={isAgency ? () => toggleInternal(c) : undefined}
                            onToggleResolved={() => toggleResolved(c)}
                            onToggleReply={() => {
                              const isOpen =
                                replyTo?.id === c.id && replyTo.where === "sidebar";
                              setReplyTo(isOpen ? null : { id: c.id, where: "sidebar" });
                              setReplyBody("");
                            }}
                            onGoToPin={() => goToPin(c)}
                            onAssign={(uid) => assignComment(c.id, uid)}
                            onEdit={
                              editId?.id === c.id && editId.where === "sidebar"
                                ? undefined
                                : () => {
                                    setEditId({ id: c.id, where: "sidebar" });
                                    setEditBody(c.body);
                                  }
                            }
                            onDelete={() => deleteComment(c.id)}
                          />
                        </div>
                      </li>
                    );
                  })}
              </ul>
            )}
          </div>
        </aside>
      </div>
      <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} modKey={modKey} />
    </div>
  );
}
