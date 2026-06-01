"use client";

import { useState } from "react";
import { Download, ExternalLink, FileIcon, Globe, Maximize2, Minimize2 } from "lucide-react";

type AssetFile = { url: string; mime: string | null; name: string | null };

function youtubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com")) return u.searchParams.get("v");
    if (u.hostname === "youtu.be") return u.pathname.slice(1) || null;
    return null;
  } catch {
    return null;
  }
}

function vimeoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("vimeo.com")) {
      const m = u.pathname.match(/\/(\d+)/);
      return m?.[1] ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

function loomId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("loom.com")) {
      const m = u.pathname.match(/share\/([a-z0-9]+)/i);
      return m?.[1] ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

export function VideoEmbed({ url }: { url: string }) {
  const yt = youtubeId(url);
  if (yt) {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-xl ring-1 ring-zinc-200">
        <iframe
          src={`https://www.youtube.com/embed/${yt}`}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }
  const vi = vimeoId(url);
  if (vi) {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-xl ring-1 ring-zinc-200">
        <iframe
          src={`https://player.vimeo.com/video/${vi}`}
          className="h-full w-full"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }
  const lo = loomId(url);
  if (lo) {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-xl ring-1 ring-zinc-200">
        <iframe
          src={`https://www.loom.com/embed/${lo}`}
          className="h-full w-full"
          allowFullScreen
        />
      </div>
    );
  }
  // mp4 directo u otro
  return (
    <video
      src={url}
      controls
      className="w-full rounded-xl bg-black ring-1 ring-zinc-200"
    />
  );
}

export function WebsiteEmbed({ url }: { url: string }) {
  const [expanded, setExpanded] = useState(false);
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {}

  return (
    <div className="rounded-xl ring-1 ring-zinc-200">
      <div className="flex items-center justify-between gap-2 border-b border-zinc-100 bg-zinc-50/70 px-3 py-2">
        <div className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-zinc-600">
          <span className="flex gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
          </span>
          <Globe className="ml-1.5 h-3 w-3 text-zinc-400" />
          <span className="truncate font-mono">{host || url}</span>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="grid h-7 w-7 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
            title={expanded ? "Reducir" : "Expandir"}
          >
            {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100"
          >
            <ExternalLink className="h-3 w-3" />
            Abrir
          </a>
        </div>
      </div>
      <div className={`overflow-hidden ${expanded ? "h-[80vh]" : "h-[520px]"}`}>
        <iframe
          src={url}
          className="h-full w-full bg-white"
          // Si el sitio tiene X-Frame-Options DENY el iframe queda en blanco. Por ahora dejamos al usuario abrir en nueva pestaña.
          referrerPolicy="no-referrer"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      </div>
      <p className="border-t border-zinc-100 bg-zinc-50/40 px-3 py-1.5 text-[10.5px] text-zinc-500">
        Si el sitio no se ve, su servidor bloquea iframes. Abrelo en nueva pestaña con el botón.
      </p>
    </div>
  );
}

export function FileList({ files }: { files: AssetFile[] }) {
  const nonImages = files.filter((f) => !(f.mime ?? "image/").startsWith("image/"));
  if (nonImages.length === 0) return null;

  return (
    <div className="rounded-xl ring-1 ring-zinc-200">
      <p className="border-b border-zinc-100 bg-zinc-50/70 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
        Archivos del entregable ({nonImages.length})
      </p>
      <ul className="divide-y divide-zinc-100/80">
        {nonImages.map((f, i) => (
          <li key={i}>
            <a
              href={f.url}
              target="_blank"
              rel="noopener noreferrer"
              download={f.name ?? ""}
              className="flex items-center gap-2.5 px-3 py-2 transition hover:bg-zinc-50"
            >
              <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-md bg-zinc-100 text-zinc-600">
                <FileIcon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-zinc-900">
                  {f.name ?? "archivo"}
                </p>
                <p className="truncate text-[10.5px] text-zinc-500">
                  {f.mime ?? "—"}
                </p>
              </div>
              <Download className="h-3.5 w-3.5 flex-shrink-0 text-zinc-400" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
