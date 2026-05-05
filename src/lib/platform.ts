"use client";

import { useEffect, useState } from "react";

/**
 * Detecta si el cliente está en macOS para mostrar la tecla modificadora correcta.
 * Vuelve "Ctrl" durante SSR / first paint para evitar mismatch.
 */
export function useIsMac(): boolean {
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    // navigator.platform está deprecated pero sigue siendo el más confiable.
    // userAgentData.platform es lo nuevo pero no está en todos los browsers.
    const ua = navigator.userAgent ?? "";
    const platform =
      (navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData?.platform ??
      navigator.platform ??
      "";
    setIsMac(/mac/i.test(platform) || /Mac OS X/i.test(ua));
  }, []);
  return isMac;
}

/**
 * Símbolo de la tecla modificadora principal: "⌘" en Mac, "Ctrl" en el resto.
 */
export function useModKey(): string {
  const isMac = useIsMac();
  return isMac ? "⌘" : "Ctrl";
}

/**
 * Símbolo de Alt: "⌥" en Mac, "Alt" en el resto.
 */
export function useAltKey(): string {
  const isMac = useIsMac();
  return isMac ? "⌥" : "Alt";
}

/**
 * Símbolo de Shift: "⇧" en Mac, "Shift" en el resto.
 */
export function useShiftKey(): string {
  const isMac = useIsMac();
  return isMac ? "⇧" : "Shift";
}
