/**
 * Helpers puros para avatares de usuario (iniciales + color estable por id).
 * Compartidos por la presencia, el board de tareas, etc. — antes estaban
 * copiados en varios componentes.
 */

/** Paleta de colores hex para avatares fallback (sin foto). */
export const AVATAR_COLORS = [
  "#3b5fff",
  "#8a2be2",
  "#ff4d8f",
  "#ff2d55",
  "#0ea5e9",
  "#22c55e",
  "#f59e0b",
  "#ec4899",
] as const;

/** Color hex estable derivado del id (hash simple). */
export function userColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

/** Iniciales de un nombre (1-2 letras). Fallback "?" si vacío. */
export function userInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return "?";
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return (
    (parts[0][0] ?? "") + (parts[parts.length - 1][0] ?? "")
  ).toUpperCase();
}
