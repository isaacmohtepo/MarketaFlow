"use client";

import { useEffect, useRef } from "react";

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}

/**
 * Registra un atajo de teclado simple por tecla.
 * - Ignora si el usuario está escribiendo en un input/textarea
 * - Ignora si hay modificadores (Cmd, Ctrl, Alt)
 * - El handler siempre se mantiene actualizado vía ref (evita stale closures)
 */
export function useShortcut(
  key: string,
  handler: () => void,
  options: { enabled?: boolean; allowInInputs?: boolean; deps?: unknown[] } = {},
) {
  const { enabled = true, allowInInputs = false } = options;
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    if (!enabled) return;
    function onKey(e: KeyboardEvent) {
      if (!allowInInputs && isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const pressed = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const want = key.length === 1 ? key.toLowerCase() : key;
      if (pressed === want) {
        e.preventDefault();
        handlerRef.current();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [key, enabled, allowInInputs]);
}
