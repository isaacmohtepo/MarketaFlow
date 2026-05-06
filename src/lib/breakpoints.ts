/**
 * Breakpoints responsive estilo Elementor. Cada valor es el upper-bound (px)
 * de esa categoría. Defaults inspirados en Elementor.
 */
export type Breakpoints = {
  mobilePortrait: number;
  tabletPortrait: number;
  tabletLandscape: number;
  laptop: number;
  widescreen: number;
};

export const DEFAULT_BREAKPOINTS: Breakpoints = {
  mobilePortrait: 767,
  tabletPortrait: 1024,
  tabletLandscape: 1200,
  laptop: 1366,
  widescreen: 1920,
};

export const BREAKPOINT_LABELS: Record<keyof Breakpoints, string> = {
  mobilePortrait: "Mobile Portrait",
  tabletPortrait: "Tablet Portrait",
  tabletLandscape: "Tablet Landscape",
  laptop: "Laptop",
  widescreen: "Widescreen",
};

/** Las claves en orden ascendente (de menor a mayor breakpoint). */
export const BREAKPOINT_KEYS: (keyof Breakpoints)[] = [
  "mobilePortrait",
  "tabletPortrait",
  "tabletLandscape",
  "laptop",
  "widescreen",
];

/** Parsea el JSON guardado en Brand.breakpoints, mergeando con defaults. */
export function parseBreakpoints(raw: unknown): Breakpoints {
  const out: Breakpoints = { ...DEFAULT_BREAKPOINTS };
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    for (const key of BREAKPOINT_KEYS) {
      const v = r[key];
      if (typeof v === "number" && Number.isFinite(v) && v > 0) {
        out[key] = Math.round(v);
      }
    }
  }
  return out;
}

/**
 * Valida que los breakpoints estén en orden ascendente y dentro de un rango
 * razonable (200..5000). Devuelve null si ok, o un mensaje de error.
 */
export function validateBreakpoints(b: Breakpoints): string | null {
  for (const k of BREAKPOINT_KEYS) {
    const v = b[k];
    if (!Number.isFinite(v) || v < 200 || v > 5000) {
      return `${BREAKPOINT_LABELS[k]} debe estar entre 200 y 5000 px`;
    }
  }
  for (let i = 1; i < BREAKPOINT_KEYS.length; i++) {
    if (b[BREAKPOINT_KEYS[i]] <= b[BREAKPOINT_KEYS[i - 1]]) {
      return `Cada breakpoint debe ser mayor al anterior (${
        BREAKPOINT_LABELS[BREAKPOINT_KEYS[i - 1]]
      } < ${BREAKPOINT_LABELS[BREAKPOINT_KEYS[i]]})`;
    }
  }
  return null;
}

/**
 * Clasifica un viewportW en una categoría de los breakpoints. Devuelve la key
 * del primer breakpoint donde `width <= upperBound`. Si excede el último
 * (widescreen), devuelve "widescreen".
 */
export function classifyViewport(
  w: number | null | undefined,
  bp: Breakpoints,
): keyof Breakpoints {
  if (!w || w <= 0) return "laptop"; // default razonable
  for (const key of BREAKPOINT_KEYS) {
    if (w <= bp[key]) return key;
  }
  return "widescreen";
}
