"use client";

import { useRef, useState } from "react";
import { GitCommit, SplitSquareHorizontal, GitMerge } from "lucide-react";

type Mode = "slider" | "side-by-side";

export default function BeforeAfterSlider({
  before,
  after,
  onClose,
  beforeLabel,
  afterLabel,
}: {
  before: string;
  after: string;
  onClose: () => void;
  beforeLabel?: string;
  afterLabel?: string;
}) {
  const [mode, setMode] = useState<Mode>("slider");

  return (
    <div className="card relative overflow-hidden p-2">
      {/* Toggle de modo + cerrar */}
      <div className="absolute right-2 top-2 z-40 flex items-center gap-1 rounded-full bg-black/60 p-0.5 backdrop-blur">
        <button
          type="button"
          onClick={() => setMode("slider")}
          className={`grid h-7 w-7 place-items-center rounded-full transition ${
            mode === "slider" ? "bg-white text-zinc-900" : "text-white/80 hover:text-white"
          }`}
          title="Modo slider"
          aria-label="Modo slider"
        >
          <GitMerge className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setMode("side-by-side")}
          className={`grid h-7 w-7 place-items-center rounded-full transition ${
            mode === "side-by-side" ? "bg-white text-zinc-900" : "text-white/80 hover:text-white"
          }`}
          title="Lado a lado"
          aria-label="Lado a lado"
        >
          <SplitSquareHorizontal className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="ml-1 rounded-full px-2.5 py-1 text-2xs font-semibold text-white/90 hover:text-white"
        >
          Cerrar
        </button>
      </div>

      {mode === "slider" ? (
        <SliderView
          before={before}
          after={after}
          beforeLabel={beforeLabel}
          afterLabel={afterLabel}
        />
      ) : (
        <SideBySideView
          before={before}
          after={after}
          beforeLabel={beforeLabel}
          afterLabel={afterLabel}
        />
      )}
    </div>
  );
}

function SliderView({
  before,
  after,
  beforeLabel,
  afterLabel,
}: {
  before: string;
  after: string;
  beforeLabel?: string;
  afterLabel?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(50);
  const [dragging, setDragging] = useState(false);

  function updateFromClientX(clientX: number) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPosition(Math.max(0, Math.min(100, pct)));
  }

  return (
    <div
      ref={wrapRef}
      className="relative aspect-square select-none overflow-hidden rounded-lg"
      onMouseDown={(e) => {
        setDragging(true);
        updateFromClientX(e.clientX);
      }}
      onMouseUp={() => setDragging(false)}
      onMouseLeave={() => setDragging(false)}
      onMouseMove={(e) => {
        if (dragging) updateFromClientX(e.clientX);
      }}
      onTouchStart={(e) => {
        setDragging(true);
        if (e.touches[0]) updateFromClientX(e.touches[0].clientX);
      }}
      onTouchMove={(e) => {
        if (dragging && e.touches[0]) updateFromClientX(e.touches[0].clientX);
      }}
      onTouchEnd={() => setDragging(false)}
    >
      {/* AFTER (current) — base */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={after}
        alt="Versión actual"
        draggable={false}
        className="absolute inset-0 h-full w-full rounded-lg object-cover"
      />
      {/* BEFORE (previous) — clipped */}
      <div
        className="absolute inset-0 overflow-hidden rounded-lg"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={before}
          alt="Versión anterior"
          draggable={false}
          className="absolute inset-0 h-full w-full rounded-lg object-cover"
        />
      </div>

      <span className="absolute left-3 top-3 z-20 rounded-full bg-black/60 px-2 py-0.5 text-2xs font-semibold text-white backdrop-blur">
        {beforeLabel ?? "Antes"}
      </span>
      <span className="absolute right-3 top-3 z-20 rounded-full bg-black/60 px-2 py-0.5 text-2xs font-semibold text-white backdrop-blur">
        {afterLabel ?? "Después"}
      </span>

      <div
        className="pointer-events-none absolute inset-y-0 z-30 w-0.5 bg-white shadow-[0_0_12px_rgba(0,0,0,0.4)]"
        style={{ left: `${position}%`, transform: "translateX(-50%)" }}
      />
      <button
        type="button"
        className="absolute z-30 grid h-10 w-10 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize place-items-center rounded-full bg-white text-zinc-800 shadow-lg ring-2 ring-white/80"
        style={{ left: `${position}%`, top: "50%" }}
        onMouseDown={(e) => {
          e.stopPropagation();
          setDragging(true);
        }}
        aria-label="Arrastra para comparar"
      >
        <GitCommit className="h-4 w-4 rotate-90" />
      </button>
    </div>
  );
}

function SideBySideView({
  before,
  after,
  beforeLabel,
  afterLabel,
}: {
  before: string;
  after: string;
  beforeLabel?: string;
  afterLabel?: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Pane src={before} label={beforeLabel ?? "Antes"} />
      <Pane src={after} label={afterLabel ?? "Después"} />
    </div>
  );
}

function Pane({ src, label }: { src: string; label: string }) {
  return (
    <div className="relative aspect-square overflow-hidden rounded-lg">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={label}
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <span className="absolute left-2 top-2 z-10 rounded-full bg-black/60 px-2 py-0.5 text-3xs font-semibold text-white backdrop-blur">
        {label}
      </span>
    </div>
  );
}
