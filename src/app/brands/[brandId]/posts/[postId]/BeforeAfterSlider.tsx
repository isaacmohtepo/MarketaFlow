"use client";

import { useRef, useState } from "react";
import { GitCommit } from "lucide-react";

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
      className="relative aspect-square overflow-hidden rounded-xl card p-2 select-none"
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

      {/* Labels */}
      <span className="absolute left-3 top-3 z-20 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
        {beforeLabel ?? "Antes"}
      </span>
      <span className="absolute right-3 top-3 z-20 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
        {afterLabel ?? "Después"}
      </span>

      {/* Divider line + handle */}
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

      {/* Salir */}
      <button
        type="button"
        onClick={onClose}
        className="absolute bottom-3 right-3 z-20 rounded-full bg-black/60 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur hover:bg-black/80"
      >
        Cerrar comparación
      </button>
    </div>
  );
}
