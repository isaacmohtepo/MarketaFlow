import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const STATUS_LABEL: Record<string, string> = {
  draft: "Borrador",
  internal_review: "Aprobación interna",
  in_review: "En revisión",
  changes_requested: "Cambios solicitados",
  approved: "Aprobado",
  scheduled: "Programado",
  published: "Publicado",
};

export const STATUS_COLOR: Record<string, string> = {
  draft: "bg-zinc-200/90 text-zinc-800",
  internal_review: "bg-violet-100/95 text-violet-800",
  in_review: "bg-amber-100/95 text-amber-800",
  changes_requested: "bg-rose-100/95 text-rose-800",
  approved: "bg-emerald-100/95 text-emerald-800",
  scheduled: "bg-blue-100/95 text-blue-800",
  published: "bg-fuchsia-100/95 text-fuchsia-800",
};
