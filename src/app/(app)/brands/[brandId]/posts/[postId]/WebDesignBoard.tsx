"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmDialog";
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
import { parseBreakpoints } from "@/lib/breakpoints";

// Callback ref: focus al elemento sin scrollear el documento padre
function focusNoScrollRef(el: HTMLTextAreaElement | null) {
  if (el) el.focus({ preventScroll: true });
}

/**
 * Clasifica un viewport (en px) en una de las 5 categorías de breakpoints de
 * la marca. El comment hereda esta clasificación de su `viewportW` guardado
 * al crearlo. Comments legacy sin viewportW caen a "laptop" (default razonable).
 */
type DeviceClass =
  | "mobilePortrait"
  | "tabletPortrait"
  | "tabletLandscape"
  | "laptop"
  | "widescreen";
function deviceFromViewport(
  w: number | null | undefined,
  bp: {
    mobilePortrait: number;
    tabletPortrait: number;
    tabletLandscape: number;
    laptop: number;
    widescreen: number;
  },
): DeviceClass {
  if (!w || w <= 0) return "laptop";
  if (w <= bp.mobilePortrait) return "mobilePortrait";
  if (w <= bp.tabletPortrait) return "tabletPortrait";
  if (w <= bp.tabletLandscape) return "tabletLandscape";
  if (w <= bp.laptop) return "laptop";
  return "widescreen";
}

/** Etiquetas cortas para las 5 categorías, mostradas en badges/tooltips. */
const DEVICE_LABEL: Record<DeviceClass, string> = {
  mobilePortrait: "Mobile",
  tabletPortrait: "Tablet ↕",
  tabletLandscape: "Tablet ↔",
  laptop: "Laptop",
  widescreen: "Widescreen",
};

/**
 * Tiempo relativo corto, estilo chat (ej. "ahora", "5 min", "2 h", "3 d", o
 * fecha + hora si pasa de una semana). Usado en el header de cada thread.
 */
function relTimeShort(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} d`;
  return new Date(iso).toLocaleDateString("es", {
    day: "numeric",
    month: "short",
  });
}

/**
 * Normaliza una URL a su pathname (ignorando query/hash) para agrupar
 * comentarios por página. Ej: "https://staging.com/about?utm=x#top" → "/about".
 * Si la URL no parsea, devuelve el string original como fallback.
 */
function pagePathFromUrl(url: string | null | undefined): string {
  if (!url) return "/";
  try {
    const u = new URL(url);
    return u.pathname || "/";
  } catch {
    return url;
  }
}

/**
 * Construye una URL absoluta dentro del mismo origin del sourceUrl, dado un
 * pathname. Útil para navegar el iframe programáticamente al click de una
 * página descubierta.
 */
function urlForPath(sourceUrl: string | null, pathname: string): string {
  if (!sourceUrl) return pathname;
  try {
    const u = new URL(sourceUrl);
    u.pathname = pathname;
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return pathname;
  }
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
  Lock,
  Maximize2,
  MessageSquarePlus,
  Minimize2,
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
  brandBreakpoints,
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
  brandBreakpoints?: unknown;
  initialComments: Comment[];
  currentUserId: string;
  canComment: boolean;
  isAgency: boolean;
  postStatus: string;
}) {
  // Breakpoints específicos de la marca (con fallback a defaults Elementor).
  // Usados para clasificar comentarios responsive y decidir el ancho de los
  // presets mobile/tablet del preview.
  const bp = useMemo(() => parseBreakpoints(brandBreakpoints), [brandBreakpoints]);
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
  // Filtro por página: "current" → solo muestra comentarios/pines de la página
  // que está abierta en el iframe. "all" → muestra todos (útil para ver el
  // overview de feedback en el sidebar). El default es "current" porque pins
  // de otra página no tienen sentido visual.
  const [pageFilter, setPageFilter] = useState<"current" | "all">("current");
  // Filtro por dispositivo: "current" muestra solo comments hechos desde el
  // mismo viewport (mobile/tablet/desktop) que el preview activo. "all" mezcla
  // todos. Default "current" para que al cambiar a mobile veas el feedback
  // específico de mobile (escenarios responsive).
  const [deviceFilter, setDeviceFilter] = useState<"current" | "all">("current");
  // URL actualmente cargada en el iframe. Cambia cuando el usuario clickea una
  // página en el navigator (programmatic) o navega dentro del iframe (vía
  // bridge "ready"). Iniciamos en sourceUrl.
  const [currentSrc, setCurrentSrc] = useState<string | null>(sourceUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirm: confirmDialog } = useConfirm();
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
  // Fullscreen "app-level": el board se vuelve fixed inset-0 cubriendo todo
  // el viewport (incluyendo sidebar de AppShell). Útil para revisar diseños
  // grandes sin chrome alrededor. Toggle con botón o tecla F. Esc para salir.
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Lock body scroll mientras estamos en fullscreen para que la página detrás
  // no se mueva con la rueda del mouse.
  useEffect(() => {
    if (!isFullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isFullscreen]);

  // Detectamos el ancho de pantalla del usuario para limitar las opciones de
  // viewport. Si el user está usando MarketaFlow desde un mobile (≤
  // bp.mobilePortrait), no tiene sentido ofrecer previews de tablet/laptop/
  // widescreen — no caben ni siquiera escalados. Solo mostramos Mobile.
  // null hasta el primer client render → en SSR y primer paint NO filtramos
  // nada, evitando hydration mismatch (server no conoce el ancho del browser).
  const [userScreenWidth, setUserScreenWidth] = useState<number | null>(null);
  useEffect(() => {
    setUserScreenWidth(window.innerWidth);
    function onResize() {
      setUserScreenWidth(window.innerWidth);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const isUserOnMobile = userScreenWidth !== null && userScreenWidth <= bp.mobilePortrait;
  // Viewport activo: 5 categorías matching los breakpoints de la marca.
  // "laptop" es el default razonable (cercano a desktop sin ser full width).
  type ViewportKey =
    | "mobilePortrait"
    | "tabletPortrait"
    | "tabletLandscape"
    | "laptop"
    | "widescreen";
  const [viewport, setViewport] = useState<ViewportKey>("widescreen");
  // Si el usuario entra desde mobile y el viewport activo no es mobile,
  // forzamos a mobile. Lo mismo cuando achica la ventana — no podemos
  // previsualizar un widescreen desde un teléfono.
  useEffect(() => {
    if (isUserOnMobile && viewport !== "mobilePortrait") {
      setViewport("mobilePortrait");
    }
  }, [isUserOnMobile, viewport]);
  // Ancho REAL del iframe para cada viewport. El iframe renderiza el sitio a
  // este ancho exacto (no se ajusta al container). Si excede el espacio
  // disponible se escala visualmente con CSS transform para entrar — así el
  // sitio cree estar en widescreen (2400px) y aplica los CSS responsive
  // correspondientes, pero tú ves un preview proporcional.
  const viewportWidth: number = (() => {
    if (viewport === "mobilePortrait") return Math.min(390, bp.mobilePortrait);
    if (viewport === "tabletPortrait") return bp.mobilePortrait + 1;
    if (viewport === "tabletLandscape") return bp.tabletPortrait + 1;
    if (viewport === "laptop") return bp.tabletLandscape + 1;
    return bp.widescreen; // widescreen renderiza al valor configurado
  })();

  // Medimos el contenedor del canvas para calcular el scale factor cuando
  // viewportWidth excede el espacio disponible.
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(0);
  useEffect(() => {
    if (!canvasContainerRef.current) return;
    const el = canvasContainerRef.current;
    const obs = new ResizeObserver((entries) => {
      for (const e of entries) setCanvasWidth(e.contentRect.width);
    });
    obs.observe(el);
    setCanvasWidth(el.getBoundingClientRect().width);
    return () => obs.disconnect();
  }, []);

  // Scale factor: 1 si el viewport entra; < 1 si hay que escalarlo.
  // Reservamos 32px de padding lateral para que no quede pegado a los bordes.
  const previewScale =
    canvasWidth > 0 && viewportWidth > canvasWidth - 32
      ? (canvasWidth - 32) / viewportWidth
      : 1;
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
        const ok = await confirmDialog({
          title: `${pendingInternal} ${
            pendingInternal === 1 ? "nota interna sin resolver" : "notas internas sin resolver"
          }`,
          description:
            "El cliente no las verá, pero quizás conviene atenderlas antes de pasar a revisión.",
          confirmLabel: "Cambiar igual",
          cancelLabel: "Volver",
          variant: "warning",
        });
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
        const j = await res.json().catch(() => ({}));
        toast.error("No se pudo cambiar el estado", {
          description: j.error ?? res.statusText,
        });
        return;
      }
      toast.success("Estado actualizado");
    } catch (err) {
      setLiveStatus(prev);
      console.error("changeStatus failed", err);
      toast.error("Error de red al cambiar el estado");
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

  // Página actualmente abierta en el iframe. Preferimos lo que reporta el widget
  // (bridge.pageUrl, que refleja la URL real cargada incluso si el usuario
  // navegó dentro del iframe). Si el bridge todavía no está conectado, caemos
  // al currentSrc que pusimos al iframe.
  const activeIframePageUrl =
    bridge.state === "ready" ? bridge.pageUrl : currentSrc ?? sourceUrl ?? "";
  const currentPagePath = pagePathFromUrl(activeIframePageUrl);

  // Agrupa parent comments por pathname de pageUrl. Los pins de página A no
  // tienen sentido cuando estás en página B (los selectores no van a matchear),
  // así que esta agrupación es lo que hace posible la UI multi-página.
  const pagesIndex = useMemo(() => {
    const map = new Map<
      string,
      { path: string; url: string; total: number; unresolved: number }
    >();
    // Siempre incluir la página inicial (sourceUrl) aunque no tenga comments
    if (sourceUrl) {
      const path = pagePathFromUrl(sourceUrl);
      map.set(path, { path, url: sourceUrl, total: 0, unresolved: 0 });
    }
    // También la página actual si difiere
    if (activeIframePageUrl) {
      const path = pagePathFromUrl(activeIframePageUrl);
      if (!map.has(path)) {
        map.set(path, { path, url: activeIframePageUrl, total: 0, unresolved: 0 });
      }
    }
    for (const c of parents) {
      if (!c.pageUrl) continue;
      const path = pagePathFromUrl(c.pageUrl);
      const existing = map.get(path);
      if (existing) {
        existing.total += 1;
        if (!c.resolved) existing.unresolved += 1;
      } else {
        map.set(path, {
          path,
          url: c.pageUrl,
          total: 1,
          unresolved: c.resolved ? 0 : 1,
        });
      }
    }
    return map;
  }, [parents, sourceUrl, activeIframePageUrl]);

  const pages = useMemo(() => {
    const arr = Array.from(pagesIndex.values());
    arr.sort((a, b) => {
      // Home (sourceUrl path) primero
      const homePath = sourceUrl ? pagePathFromUrl(sourceUrl) : null;
      if (homePath) {
        if (a.path === homePath) return -1;
        if (b.path === homePath) return 1;
      }
      // Después por unresolved descendente, luego alfabético
      if (a.unresolved !== b.unresolved) return b.unresolved - a.unresolved;
      return a.path.localeCompare(b.path);
    });
    return arr;
  }, [pagesIndex, sourceUrl]);

  // Si el filtro está en "current", solo mostramos parents cuyo pageUrl matchea
  // la página activa. Si "all", mostramos todos. Comments sin pageUrl (legacy,
  // pre-multipage) se asumen de la home.
  const parentsForPage = useMemo(() => {
    if (pageFilter === "all") return parents;
    return parents.filter((c) => {
      if (!c.pageUrl) {
        // Legacy: cuando no había multi-page, todo era home
        return sourceUrl ? pagePathFromUrl(sourceUrl) === currentPagePath : true;
      }
      return pagePathFromUrl(c.pageUrl) === currentPagePath;
    });
  }, [parents, pageFilter, currentPagePath, sourceUrl]);

  // Filtro por dispositivo aplicado encima del filtro de página. Cuando estás
  // viendo el preview en mobile, por default solo aparecen los comments hechos
  // desde mobile — útil para revisar issues responsive sin que el sidebar se
  // mezcle con feedback de desktop.
  const parentsForDevice = useMemo(() => {
    if (deviceFilter === "all") return parentsForPage;
    return parentsForPage.filter((c) => deviceFromViewport(c.viewportW, bp) === viewport);
  }, [parentsForPage, deviceFilter, viewport, bp]);
  // repliesByParent se calcula más abajo, lo necesitamos antes para el filtro "awaiting"
  const repliesCountByParent = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of comments) {
      if (c.parentId) m.set(c.parentId, (m.get(c.parentId) ?? 0) + 1);
    }
    return m;
  }, [comments]);

  const visibleParents = useMemo(() => {
    // Empezamos por los parents ya filtrados por página + dispositivo
    let arr = parentsForDevice;
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
  }, [parentsForDevice, filterMode, searchQuery, currentUserId, repliesCountByParent]);
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

  // Mandar al widget la lista de pines a trackear cuando cambian o cuando se
  // conecta. Solo enviamos pins de la página activa — comments de otra página
  // tienen selectores que no van a matchear aquí y aparecerían como orphan.
  useEffect(() => {
    if (bridge.state !== "ready" || !sourceOrigin) return;
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    const homePath = sourceUrl ? pagePathFromUrl(sourceUrl) : null;
    const pins = parents
      .filter((c) => {
        if (!c.selector) return false;
        // Si el comment no tiene pageUrl (legacy), asumimos que es de la home
        const cPath = c.pageUrl ? pagePathFromUrl(c.pageUrl) : homePath;
        if (cPath !== currentPagePath) return false;
        // Filtro por device: si el toggle está en "current", solo mostramos
        // pins del mismo device class que el preview activo. Comments sin
        // viewportW caen a "desktop".
        if (deviceFilter === "current") {
          return deviceFromViewport(c.viewportW, bp) === viewport;
        }
        return true;
      })
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
  }, [parents, bridge.state, sourceOrigin, currentPagePath, sourceUrl, deviceFilter, viewport]);

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
              "El widget no respondió. Verifica que el script esté instalado en el sitio o que el sitio permita ser embebido (sin X-Frame-Options).",
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
        } else if (isFullscreen) {
          setIsFullscreen(false);
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
      if (k === "f") {
        e.preventDefault();
        setIsFullscreen((v) => !v);
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
    isFullscreen,
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
    // Coords iframe-internas: dividimos por previewScale porque el wrapper
    // está escalado con CSS transform. El widget usa coords iframe-internas
    // (no escaladas) para el elementsFromPoint.
    const iframeClientX = (e.clientX - rect.left) / previewScale;
    const iframeClientY = (e.clientY - rect.top) / previewScale;
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
      // Viewport REAL del iframe (no escalado) — el widget reporta esto en
      // result.viewportW/H. Caemos a viewportWidth si no vino info.
      viewportW: result.viewportW || viewportWidth,
      viewportH: result.viewportH || Math.round(rect.height / previewScale),
      scrollY: result.scrollY,
    });
    setDraftBody("");
    setActiveId(null);
  }

  async function toggleResolved(c: Comment) {
    // Optimistic: flip al instante, revert si falla
    const next = !c.resolved;
    setComments((arr) => arr.map((x) => (x.id === c.id ? { ...x, resolved: next } : x)));
    try {
      const res = await fetch(`/api/comments/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolved: next }),
      });
      if (!res.ok) {
        setComments((arr) =>
          arr.map((x) => (x.id === c.id ? { ...x, resolved: c.resolved } : x)),
        );
        const j = await res.json().catch(() => ({}));
        toast.error(next ? "No se pudo marcar como resuelto" : "No se pudo reabrir", {
          description: j.error ?? res.statusText,
        });
        return;
      }
      const j = await res.json();
      setComments((arr) => arr.map((x) => (x.id === c.id ? { ...x, ...j.comment } : x)));
    } catch {
      setComments((arr) =>
        arr.map((x) => (x.id === c.id ? { ...x, resolved: c.resolved } : x)),
      );
      toast.error("Error de red");
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
    const ok = await confirmDialog({
      title: "¿Borrar este comentario?",
      description: "No se puede deshacer.",
      confirmLabel: "Borrar",
      cancelLabel: "Cancelar",
      variant: "danger",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/comments/${id}`, { method: "DELETE" });
      if (res.ok) {
        setComments((arr) => arr.filter((c) => c.id !== id && c.parentId !== id));
        if (activeId === id) setActiveId(null);
      } else {
        const j = await res.json().catch(() => ({}));
        toast.error("No se pudo borrar el comentario", {
          description: j.error ?? res.statusText,
        });
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
    // Si el thread es de otra página, navegamos el iframe a esa página
    // automáticamente — sino el pin no aparecería y sería confuso.
    const target = comments.find((c) => c.id === id);
    if (target?.pageUrl) {
      const targetPath = pagePathFromUrl(target.pageUrl);
      if (targetPath !== currentPagePath) {
        setCurrentSrc(target.pageUrl);
        setIframeKey((k) => k + 1);
        setBridge({ state: "idle" });
      }
    }
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
    <div
      className={
        isFullscreen
          ? "fixed inset-0 z-[100] overflow-auto bg-white"
          : "card overflow-hidden p-0"
      }
    >
      {/* Banner de modo equipo: aparece cuando el post está en draft (cliente no ve nada) */}
      {isInternalMode && (
        <div className="flex items-center gap-2 border-b border-violet-200 bg-violet-50 px-3 py-1.5 text-[12px] text-violet-900">
          <span className="text-base leading-none">🔒</span>
          <p className="flex-1 leading-tight">
            <span className="font-bold">Modo equipo.</span> Los comentarios nuevos quedan privados —
            el cliente no ve este entregable ni los comentarios. Cambia el status a{" "}
            <span className="font-semibold">En revisión</span> cuando estén listos.
          </p>
        </div>
      )}
      {/* Topbar */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-zinc-100 px-2 py-1.5 sm:gap-2 sm:px-3 sm:py-2">
        <div className="flex items-center gap-1.5 sm:gap-2">
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
              <span className="hidden sm:inline">
                {commentMode ? "Click sobre el sitio · Esc" : "Comentar"}
              </span>
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
                <span className="hidden sm:inline">Conversaciones</span>
                {parents.length > 0 && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-3xs font-bold tabular-nums ${
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
        <div className="flex items-center gap-1.5 sm:gap-2">
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
            <span
              className="hidden items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700 ring-1 ring-emerald-100 sm:inline-flex"
              title="Widget conectado"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Live
            </span>
          )}
          {bridge.state === "connecting" && (
            <span className="inline-flex items-center gap-1 text-2xs text-zinc-500">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span className="hidden sm:inline">Conectando widget…</span>
            </span>
          )}
          {/* Toggle multi-device — 5 viewports basados en breakpoints de la marca.
              El ancho mostrado en el tooltip es el preview width (lower-bound de
              la categoría) para que veas el "worst case" de cada device. */}
          <div className="flex items-center gap-0.5 rounded-md bg-zinc-100 p-0.5 ring-1 ring-zinc-200">
            {(
              [
                {
                  mode: "mobilePortrait",
                  Icon: Smartphone,
                  width: Math.min(390, bp.mobilePortrait),
                  title: "Mobile Portrait",
                  rotated: false,
                  large: false,
                },
                {
                  mode: "tabletPortrait",
                  Icon: Tablet,
                  width: bp.mobilePortrait + 1,
                  title: "Tablet Portrait",
                  rotated: false,
                  large: false,
                },
                {
                  mode: "tabletLandscape",
                  Icon: Tablet,
                  width: bp.tabletPortrait + 1,
                  title: "Tablet Landscape",
                  rotated: true,
                  large: false,
                },
                {
                  mode: "laptop",
                  Icon: Monitor,
                  width: bp.tabletLandscape + 1,
                  title: "Laptop",
                  rotated: false,
                  large: false,
                },
                {
                  mode: "widescreen",
                  Icon: Monitor,
                  width: null,
                  title: "Widescreen",
                  rotated: false,
                  large: true,
                },
              ] as Array<{
                mode: ViewportKey;
                Icon: typeof Smartphone;
                width: number | null;
                title: string;
                rotated: boolean;
                large: boolean;
              }>
            )
              .filter(
                // En mobile real solo mostramos Mobile Portrait — no tiene
                // sentido previsualizar otros tamaños desde un teléfono.
                (item) => !isUserOnMobile || item.mode === "mobilePortrait",
              )
              .map(({ mode, Icon, width, title, rotated, large }) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewport(mode)}
                title={`${title}${width ? ` · ${width}px` : " · 100%"}`}
                className={`group/vp grid h-7 w-7 place-items-center rounded transition ${
                  viewport === mode
                    ? "bg-white text-zinc-900 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-900"
                }`}
              >
                <Icon
                  className={`${large ? "h-4 w-4" : "h-3.5 w-3.5"} ${
                    rotated ? "rotate-90" : ""
                  }`}
                />
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="grid h-8 w-8 place-items-center rounded text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 sm:h-6 sm:w-6"
            title="Atajos de teclado (?)"
          >
            <span className="font-mono text-[13px] font-bold sm:text-[12px]">?</span>
          </button>
          <button
            type="button"
            onClick={reloadIframe}
            className="inline-flex h-8 w-8 items-center justify-center rounded text-[11.5px] font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 sm:h-auto sm:w-auto sm:gap-1 sm:px-2 sm:text-zinc-600"
            title="Recargar el iframe"
          >
            <RefreshCcw className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
            <span className="hidden sm:inline">Recargar</span>
          </button>
          <button
            type="button"
            onClick={() => setIsFullscreen((v) => !v)}
            className="inline-flex h-8 w-8 items-center justify-center rounded text-[11.5px] font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 sm:h-auto sm:w-auto sm:gap-1 sm:px-2 sm:text-zinc-600"
            title={
              isFullscreen
                ? "Salir de pantalla completa (F · Esc)"
                : "Pantalla completa (F)"
            }
          >
            {isFullscreen ? (
              <Minimize2 className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
            )}
            <span className="hidden sm:inline">{isFullscreen ? "Salir" : "Full"}</span>
          </button>
          {sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 w-8 items-center justify-center rounded text-[11.5px] font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 sm:h-auto sm:w-auto sm:gap-1.5 sm:px-2 sm:text-zinc-600"
              title="Abrir en nueva pestaña"
            >
              <ExternalLink className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
              <span className="hidden sm:inline">Abrir</span>
            </a>
          )}
        </div>
      </div>

      {/* Page navigator: fila propia con scroll horizontal. Solo se muestra
          cuando hay 2+ páginas con comentarios. */}
      {liveModeAvailable && pages.length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto border-t border-zinc-200 bg-gradient-to-b from-white to-zinc-50/50 px-2 py-1.5 sm:gap-2 sm:px-3 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]">
          {pages.map((p) => {
            const isActive = p.path === currentPagePath;
            const isHome = sourceUrl
              ? pagePathFromUrl(sourceUrl) === p.path
              : false;
            return (
              <button
                key={p.path}
                type="button"
                onClick={() => {
                  if (p.path === currentPagePath) {
                    setCurrentSrc(
                      activeIframePageUrl || urlForPath(sourceUrl, p.path),
                    );
                  } else {
                    const newUrl = urlForPath(sourceUrl, p.path);
                    setCurrentSrc(newUrl);
                  }
                  setIframeKey((k) => k + 1);
                  setBridge({ state: "idle" });
                }}
                title={p.url}
                className={`group inline-flex flex-shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold transition ${
                  isActive
                    ? "bg-zinc-900 text-white shadow-sm"
                    : "bg-white text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-100"
                }`}
              >
                {isHome ? (
                  <Globe className="h-3 w-3" />
                ) : (
                  <span className="font-mono text-3xs opacity-60">/</span>
                )}
                <span className="max-w-[140px] truncate">
                  {isHome ? "Home" : p.path.replace(/^\//, "") || "/"}
                </span>
                {p.unresolved > 0 ? (
                  <span
                    className={`rounded-full px-1.5 py-px text-[9.5px] font-bold tabular-nums ${
                      isActive
                        ? "bg-rose-400/30 text-white"
                        : "bg-rose-100 text-rose-700"
                    }`}
                    title={`${p.unresolved} sin resolver`}
                  >
                    {p.unresolved}
                  </span>
                ) : p.total > 0 ? (
                  <span
                    className={`rounded-full px-1.5 py-px text-[9.5px] font-bold tabular-nums ${
                      isActive
                        ? "bg-white/20 text-white"
                        : "bg-zinc-100 text-zinc-500"
                    }`}
                    title={`${p.total} resueltos`}
                  >
                    {p.total}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      {/* Filter toggles: fila propia con wrap. Page filter (si hay 2+ páginas)
          + device filter. Estructura limpia que se acomoda en cualquier ancho. */}
      {liveModeAvailable && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-zinc-200 bg-zinc-50/40 px-2 py-1 sm:gap-2 sm:px-3">
          {pages.length > 1 && (
            <div
              className="flex items-center gap-0.5 rounded-md bg-white p-0.5 ring-1 ring-zinc-200"
              title="Filtrar comments por página"
            >
              <button
                type="button"
                onClick={() => setPageFilter("current")}
                className={`rounded px-2 py-0.5 text-[10.5px] font-semibold transition ${
                  pageFilter === "current"
                    ? "bg-zinc-900 text-white shadow-sm"
                    : "text-zinc-500 hover:text-zinc-900"
                }`}
              >
                Esta página
              </button>
              <button
                type="button"
                onClick={() => setPageFilter("all")}
                className={`rounded px-2 py-0.5 text-[10.5px] font-semibold transition ${
                  pageFilter === "all"
                    ? "bg-zinc-900 text-white shadow-sm"
                    : "text-zinc-500 hover:text-zinc-900"
                }`}
              >
                Todas
              </button>
            </div>
          )}

          <div
            className="flex items-center gap-0.5 rounded-md bg-white p-0.5 ring-1 ring-zinc-200"
            title="Filtrar comments por device class"
          >
            <button
              type="button"
              onClick={() => setDeviceFilter("current")}
              className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10.5px] font-semibold transition ${
                deviceFilter === "current"
                  ? "bg-zinc-900 text-white shadow-sm"
                  : "text-zinc-500 hover:text-zinc-900"
              }`}
              title={`Solo comentarios hechos en ${DEVICE_LABEL[viewport]}`}
            >
              {viewport === "mobilePortrait" ? (
                <Smartphone className="h-3 w-3" />
              ) : viewport === "tabletPortrait" ? (
                <Tablet className="h-3 w-3" />
              ) : viewport === "tabletLandscape" ? (
                <Tablet className="h-3 w-3 rotate-90" />
              ) : (
                <Monitor className="h-3 w-3" />
              )}
              {DEVICE_LABEL[viewport]}
            </button>
            <button
              type="button"
              onClick={() => setDeviceFilter("all")}
              className={`rounded px-2 py-0.5 text-[10.5px] font-semibold transition ${
                deviceFilter === "all"
                  ? "bg-zinc-900 text-white shadow-sm"
                  : "text-zinc-500 hover:text-zinc-900"
              }`}
            >
              Todos
            </button>
          </div>
        </div>
      )}

      <div className="relative">
        {/* Canvas: iframe live + overlay. El contenedor mide su propio ancho
            con ResizeObserver para calcular el scale factor cuando el viewport
            elegido excede el espacio disponible. Usamos flex para centrar el
            sizing wrapper visualmente. */}
        <div
          ref={canvasContainerRef}
          className="relative flex justify-center overflow-hidden bg-zinc-100 py-1 sm:py-4"
          style={{
            // 3 modos de altura del canvas. Usamos 100dvh (dynamic viewport
            // height) en mobile para que se adapte al ocultarse el URL bar
            // del browser y aproveche todo el alto disponible.
            // - Fullscreen: todo el viewport menos toolbars (~110px)
            // - Mobile: 100dvh menos las 4 toolbars del board (~140px). El
            //   HISTORIAL queda abajo y se ve scrolleando — esto le da al
            //   iframe casi toda la pantalla del teléfono.
            // - Desktop normal: 80vh
            height: isFullscreen
              ? previewScale < 1
                ? `calc((100vh - 110px) * ${previewScale})`
                : "calc(100vh - 110px)"
              : isUserOnMobile
                ? previewScale < 1
                  ? `calc((100dvh - 140px) * ${previewScale})`
                  : "calc(100dvh - 140px)"
                : previewScale < 1
                  ? `calc(80vh * ${previewScale})`
                  : "80vh",
            maxHeight: isFullscreen
              ? "calc(100vh - 110px)"
              : isUserOnMobile
                ? "calc(100dvh - 140px)"
                : "80vh",
          }}
        >
          {/* Sizing wrapper: ocupa el espacio VISUAL (post-scale) en el layout,
              así flex justify-center lo centra correctamente. Su hijo tiene
              dimensiones REALES del viewport y se escala con CSS transform. */}
          <div
            style={{
              width: `${viewportWidth * previewScale}px`,
              height: isFullscreen
                ? `calc((100vh - 110px) * ${previewScale})`
                : isUserOnMobile
                  ? `calc((100dvh - 140px) * ${previewScale})`
                  : `calc(80vh * ${previewScale})`,
            }}
          >
          <div
            className="relative"
            style={{
              width: `${viewportWidth}px`,
              height: isFullscreen
                ? "calc(100vh - 110px)"
                : isUserOnMobile
                  ? "calc(100dvh - 140px)"
                  : "80vh",
              transform: previewScale < 1 ? `scale(${previewScale})` : undefined,
              transformOrigin: "top left",
            }}
          >
          <iframe
            key={iframeKey}
            ref={iframeRef}
            src={currentSrc ?? sourceUrl ?? undefined}
            onLoad={onIframeLoad}
            style={{ boxShadow: "0 8px 32px -12px rgba(0,0,0,0.25)" }}
            className="block h-full w-full border-0 bg-white"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals"
            referrerPolicy="no-referrer-when-downgrade"
          />

          {/* Overlay para capturar clicks (solo en commentMode).
              Cuando el wrapper tiene transform: scale(s), getBoundingClientRect()
              devuelve coords escaladas. Las dividimos por previewScale para
              obtener las coords iframe-internas que el widget espera. */}
          {bridge.state === "ready" && commentMode && canComment && !draft && (
            <div
              onClick={onOverlayClick}
              onMouseMove={(e) => {
                const now = Date.now();
                if (now - hoverThrottleRef.current < 30) return;
                hoverThrottleRef.current = now;
                const target = e.currentTarget;
                const rect = target.getBoundingClientRect();
                const iframeClientX = (e.clientX - rect.left) / previewScale;
                const iframeClientY = (e.clientY - rect.top) / previewScale;
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
              <div
                className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 whitespace-nowrap rounded-full bg-zinc-900 px-3 py-1.5 text-2xs font-semibold text-white shadow-lg"
                style={{
                  // Counter-scale para que el hint se vea del mismo tamaño
                  // sin importar el zoom del wrapper.
                  transform: `translateX(-50%) scale(${1 / previewScale})`,
                  transformOrigin: "top center",
                }}
              >
                {capturing
                  ? "Anclando…"
                  : isUserOnMobile
                    ? "Toca un componente para comentar"
                    : "Click sobre el componente · Esc para salir"}
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
            // Counter-scale: el wrapper está escalado por previewScale, así
            // que el pin (28px en CSS) se vería a (28*scale)px visual. Lo
            // contra-escalamos para que mantenga su tamaño legible siempre.
            const counterScale = 1 / previewScale;
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
                  // Pins más grandes en mobile (h-9 = 36px ≈ tap target ideal)
                  // y compensados por counter-scale para que se vean del mismo
                  // tamaño visual sin importar el zoom del wrapper.
                  transform: `translate(-50%, -50%) scale(${counterScale * (active ? 1.25 : 1)})`,
                }}
                className={`absolute z-20 grid h-9 w-9 place-items-center rounded-full text-[12px] font-bold text-white shadow-md ring-2 transition-transform sm:h-7 sm:w-7 sm:text-2xs ${
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

          {/* Hover preview: mini-tarjeta flotante al pasar el mouse sobre un pin.
              Counter-scale aplicado para que el preview mantenga tamaño legible
              cuando el wrapper está escalado. */}
          {hoverId && hoverId !== activeId && liveViewport && (() => {
            const c = parents.find((p) => p.id === hoverId);
            if (!c) return null;
            const pos = pinPositions.get(c.id);
            if (!pos) return null;
            const counterScale = 1 / previewScale;
            const margin = 12;
            const previewW = 260;
            const previewH = 90;

            // Cuando contra-escalamos el preview, su layout se mide en CSS
            // pixels sin escalar; pero la posición se aplica DESPUÉS del scale
            // del wrapper. Para que entre en el viewport visual, calculamos
            // las distancias en coords iframe-internas (que es lo que
            // liveViewport.viewportW/H ya está).
            const effectiveW = previewW; // counter-scale lo deja en su tamaño natural
            const effectiveH = previewH;

            const spaceRight = liveViewport.viewportW - pos.clientX - 22 * counterScale;
            const showRight =
              spaceRight >= effectiveW + margin || pos.clientX < liveViewport.viewportW * 0.6;
            let leftPx = showRight
              ? pos.clientX + 22 * counterScale
              : pos.clientX - 22 * counterScale;

            return (
              <div
                className="pointer-events-none absolute z-30"
                style={{
                  left: `${leftPx}px`,
                  top: `${pos.clientY}px`,
                  transform: `${showRight ? "" : "translateX(-100%) "}translateY(-50%) scale(${counterScale})`,
                  transformOrigin: showRight ? "left center" : "right center",
                }}
              >
                <div className="max-w-[260px] rounded-lg bg-zinc-900/95 px-2.5 py-2 text-white shadow-xl backdrop-blur-md">
                  <p className="text-[10.5px] font-semibold opacity-80">{c.userName}</p>
                  <p className="mt-0.5 line-clamp-3 text-[12.5px] leading-snug">{c.body}</p>
                </div>
              </div>
            );
          })()}

          {/* Click popover: tarjeta con acciones cuando seleccionas un pin.
              Counter-scale aplicado para que mantenga tamaño legible cuando
              el wrapper está escalado. Collision detection se calcula contra
              las dimensiones iframe-internas del viewport. */}
          {activeId && !draft && liveViewport && (() => {
            const c = parents.find((p) => p.id === activeId);
            if (!c) return null;
            const pos = pinPositions.get(c.id);
            if (!pos) return null;
            const counterScale = 1 / previewScale;
            const margin = 16 * counterScale;
            const popoverW = 288 * counterScale; // w-72 en coords iframe (pre counter-scale)
            const popoverMaxH = Math.max(
              160 * counterScale,
              Math.min(440 * counterScale, liveViewport.viewportH - 2 * margin),
            );

            const spaceRight = liveViewport.viewportW - pos.clientX - 24 * counterScale;
            const showRight =
              spaceRight >= popoverW + margin ||
              pos.clientX < liveViewport.viewportW * 0.55;
            let leftPx = showRight
              ? pos.clientX + 24 * counterScale
              : pos.clientX - 24 * counterScale;

            return (
              <div
                className="absolute z-40"
                style={{
                  left: `${leftPx}px`,
                  top: `${pos.clientY}px`,
                  transform: `${showRight ? "" : "translateX(-100%) "}translateY(-50%) scale(${counterScale})`,
                  transformOrigin: showRight ? "left center" : "right center",
                }}
              >
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{ maxHeight: `${popoverMaxH / counterScale}px` }}
                  className="flex w-72 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl"
                >
                  {/* Header fijo */}
                  <div className="flex items-start justify-between gap-2 border-b border-zinc-100 p-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br ${gradientForName(
                          c.userName,
                        )} text-2xs font-bold text-white`}
                      >
                        {c.userName[0]?.toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-semibold text-zinc-900">
                          {c.userName}
                        </p>
                        <p className="text-3xs text-zinc-500">
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
                          <span className="ml-1 text-3xs italic text-zinc-400">
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
              porque el usuario está escribiendo, no se espera que scrollee).
              Counter-scale al wrapper para que pin + composer mantengan tamaño
              natural cuando el iframe está escalado (widescreen, etc). */}
          {draft && (
            <div
              style={{
                left: `${draft.clientX}px`,
                top: `${draft.clientY}px`,
                transform: `translate(-50%, -50%) scale(${1 / previewScale})`,
              }}
              className="absolute z-30"
            >
              <span className="grid h-7 w-7 place-items-center rounded-full bg-fuchsia-600 text-2xs font-bold text-white shadow-md ring-2 ring-white">
                {parents.length + 1}
              </span>
              <div
                onClick={(e) => e.stopPropagation()}
                className={`absolute w-72 rounded-xl border border-zinc-200 bg-white p-2.5 shadow-xl ${
                  liveViewport && draft.clientX > liveViewport.viewportW * 0.7
                    ? "right-0"
                    : "left-0"
                } ${
                  // Si el click está en el tercio inferior del viewport, ponemos
                  // el editor ARRIBA del pin (bottom-full mb-2) en vez de abajo,
                  // para que no se corte contra el borde inferior.
                  liveViewport && draft.clientY > liveViewport.viewportH * 0.6
                    ? "bottom-full mb-2"
                    : "top-full mt-2"
                }`}
              >
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <p className="text-[10.5px] font-semibold uppercase tracking-wider text-zinc-500">
                    Comentario en vivo
                  </p>
                  {isInternalMode && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-1.5 py-0.5 text-3xs font-bold uppercase tracking-wider text-violet-700 ring-1 ring-violet-200"
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
                {error && <p className="mt-1 text-2xs text-rose-600">{error}</p>}
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
                        Verifica que el script <span className="font-mono">widget.js</span> esté
                        pegado en el sitio.
                      </li>
                      <li>
                        Si el sitio devuelve <span className="font-mono">X-Frame-Options: DENY</span>
                        {" "}o <span className="font-mono">CSP frame-ancestors</span>, no se puede
                        embeber. Prueba con staging.
                      </li>
                      <li>
                        Si todo está bien, toca <strong>Recargar</strong> arriba.
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
        </div>

        {/* Drawer flotante (slide-in desde la derecha) */}
        {sidebarOpen && (
          <div
            className="absolute inset-0 z-40 bg-zinc-900/20 backdrop-blur-[2px]"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <aside
          className={`absolute right-0 top-0 bottom-0 z-50 w-full border-l border-zinc-200 bg-zinc-50/95 shadow-2xl backdrop-blur-md transition-transform duration-200 sm:w-[400px] sm:max-w-[90vw] ${
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
                          className={`flex flex-shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-2xs font-semibold transition ${
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
                            ? "No tienes comentarios propios"
                            : filterMode === "assigned_to_me"
                              ? "Nada asignado a tú 🎉"
                              : filterMode === "internal_only"
                                ? "Sin notas internas del equipo"
                                : filterMode === "public_only"
                                  ? "Sin comentarios públicos del cliente"
                                  : filterMode === "awaiting"
                                    ? "Todo respondido"
                                    : "Nada por aquí"}
                </p>
                {canComment && parents.length === 0 && bridge.state === "ready" && (
                  <p className="text-2xs text-zinc-500">
                    Toca <span className="font-medium">Comentar</span> y haz click sobre cualquier
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
                    className="text-2xs font-semibold text-fuchsia-700 hover:underline"
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
                    let path = "";
                    if (c.pageUrl) {
                      try {
                        const u = new URL(c.pageUrl);
                        host = u.host.replace(/^www\./, "");
                        path = u.pathname || "/";
                      } catch {}
                    }
                    // Mostramos el badge de página cuando el comment es de
                    // otra página distinta a la activa (modo "all" o legacy
                    // sin filtro), para que el usuario sepa de dónde viene.
                    const showPageBadge =
                      pageFilter === "all" && path && path !== currentPagePath;
                    // Device class del comment según viewportW que se guardó
                    // al crearlo. Mostramos el badge cuando estamos en modo
                    // "all" o el device del comment difiere del activo.
                    const commentDevice = deviceFromViewport(c.viewportW, bp);
                    const showDeviceBadge =
                      deviceFilter === "all" && commentDevice !== viewport;
                    // Extraer "tag HTML" del selector (ej. "div.card > button.btn-primary" → "BUTTON")
                    const componentTag = (() => {
                      if (!c.selector) return null;
                      const last = c.selector.split(">").pop()?.trim() ?? "";
                      const m = last.match(/^([a-z][a-z0-9]*)/i);
                      return m ? m[1].toUpperCase() : null;
                    })();
                    const replies = repliesByParent.get(c.id) ?? [];
                    const isReplyOpen =
                      replyTo?.id === c.id && replyTo.where === "sidebar";
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
                        className={`group/thread relative cursor-pointer overflow-hidden rounded-xl border bg-white transition-all duration-200 ${
                          c.internal
                            ? "border-violet-200 bg-violet-50/30"
                            : "border-zinc-200"
                        } ${
                          active
                            ? "border-fuchsia-300 shadow-[0_4px_20px_-6px_rgba(217,70,239,0.25)] ring-1 ring-fuchsia-200"
                            : "hover:border-zinc-300 hover:shadow-sm"
                        } ${c.resolved ? "bg-emerald-50/20" : ""}`}
                      >
                        {/* Header thin: pin#, página, tiempo, internal/orphan flags */}
                        <div
                          className={`flex items-center gap-2 border-b px-3 py-1.5 text-[10.5px] ${
                            c.resolved
                              ? "border-emerald-100 bg-emerald-50/40 text-emerald-700"
                              : c.internal
                                ? "border-violet-100 bg-violet-50/50 text-violet-700"
                                : "border-zinc-100 bg-zinc-50/60 text-zinc-500"
                          }`}
                        >
                          <span
                            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-bold tabular-nums ${
                              c.resolved
                                ? "bg-emerald-500 text-white"
                                : "bg-gradient-to-br from-blue-500 via-fuchsia-500 to-rose-500 text-white"
                            }`}
                            title={`Pin #${idx}`}
                          >
                            {c.resolved ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : `#${idx}`}
                          </span>
                          {showPageBadge && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const newUrl = urlForPath(sourceUrl, path);
                                setCurrentSrc(newUrl);
                                setIframeKey((k) => k + 1);
                                setBridge({ state: "idle" });
                              }}
                              title={`Ir a ${path}`}
                              className="inline-flex items-center gap-0.5 rounded-md bg-amber-50 px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100"
                            >
                              {path}
                            </button>
                          )}
                          {showDeviceBadge && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setViewport(commentDevice);
                              }}
                              title={`Hecho en ${DEVICE_LABEL[commentDevice]} — click para cambiar viewport`}
                              className="inline-flex items-center gap-0.5 rounded-md bg-sky-50 px-1.5 py-0.5 text-[9.5px] font-bold text-sky-700 ring-1 ring-sky-200 hover:bg-sky-100"
                            >
                              {commentDevice === "mobilePortrait" ? (
                                <Smartphone className="h-2.5 w-2.5" />
                              ) : commentDevice === "tabletPortrait" ? (
                                <Tablet className="h-2.5 w-2.5" />
                              ) : commentDevice === "tabletLandscape" ? (
                                <Tablet className="h-2.5 w-2.5 rotate-90" />
                              ) : (
                                <Monitor className="h-2.5 w-2.5" />
                              )}
                              {DEVICE_LABEL[commentDevice]}
                            </button>
                          )}
                          {componentTag && (
                            <span className="rounded bg-white/70 px-1 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider opacity-70">
                              {componentTag}
                            </span>
                          )}
                          <span className="flex-1" />
                          {c.internal && (
                            <span
                              className="inline-flex items-center gap-0.5 font-bold uppercase tracking-wider"
                              title="Solo lo ve el equipo"
                            >
                              <Lock className="h-2.5 w-2.5" />
                              equipo
                            </span>
                          )}
                          {orphanIds.has(c.id) && (
                            <span
                              className="inline-flex items-center gap-0.5 text-amber-600"
                              title="El componente al que apunta ya no existe"
                            >
                              <AlertTriangle className="h-2.5 w-2.5" />
                              huérfano
                            </span>
                          )}
                        </div>

                        {/* Cuerpo del thread: parent + replies con avatares alineados */}
                        <div className="px-3 pt-3 pb-2">
                          {/* Parent comment */}
                          <div className="flex items-start gap-2.5">
                            <span
                              className={`relative z-[1] grid h-7 w-7 flex-shrink-0 place-items-center rounded-full text-2xs font-bold text-white shadow-sm bg-gradient-to-br ${gradientForName(
                                c.userName,
                              )}`}
                            >
                              {c.userName[0]?.toUpperCase()}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline gap-1.5">
                                <span className="truncate text-[12.5px] font-semibold text-zinc-900">
                                  {c.userName}
                                </span>
                                <span className="text-3xs text-zinc-400">
                                  {relTimeShort(c.createdAt)}
                                </span>
                                {c.updatedAt && c.updatedAt !== c.createdAt && (
                                  <span className="text-[9.5px] italic text-zinc-400">editado</span>
                                )}
                              </div>
                              {editId?.id === c.id && editId.where === "sidebar" ? (
                                <div onClick={(e) => e.stopPropagation()} className="mt-1">
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
                                    variant="compact"
                                  />
                                </div>
                              ) : (
                                <>
                                  <p
                                    className={`mt-0.5 whitespace-pre-wrap text-[13px] leading-snug ${
                                      c.resolved ? "text-zinc-500" : "text-zinc-800"
                                    }`}
                                  >
                                    <MentionText text={c.body} />
                                  </p>
                                  <CommentAttachmentInline
                                    url={c.attachmentUrl}
                                    name={c.attachmentName}
                                    mime={c.attachmentMime}
                                  />
                                </>
                              )}
                            </div>
                          </div>

                          {/* Replies inline con timeline */}
                          {replies.length > 0 && (
                            <ul
                              className="mt-2.5 space-y-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {replies.map((r) => (
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

                          {/* Quick reply: input expandible inline */}
                          {isReplyOpen ? (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className="mt-3 ml-9"
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
                          ) : (
                            !c.resolved &&
                            canComment && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setReplyTo({ id: c.id, where: "sidebar" });
                                  setReplyBody("");
                                }}
                                className="mt-2.5 ml-9 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-2xs font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
                              >
                                <CornerDownRight className="h-3 w-3" />
                                Responder…
                              </button>
                            )
                          )}
                        </div>

                        {/* Footer de acciones — sutil, sin bordes pesados */}
                        <div onClick={(e) => e.stopPropagation()}>
                          <ThreadActions
                            brandId={brandId}
                            resolved={c.resolved}
                            isOwn={c.userId === currentUserId}
                            isReplyActive={isReplyOpen}
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
                              setReplyTo(isReplyOpen ? null : { id: c.id, where: "sidebar" });
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
