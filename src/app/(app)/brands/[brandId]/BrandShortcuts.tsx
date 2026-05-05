"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const FILTER_BY_NUM: Record<string, string> = {
  "1": "all",
  "2": "draft",
  "3": "in_review",
  "4": "changes_requested",
  "5": "approved",
  "6": "scheduled",
  "7": "published",
};

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}

export default function BrandShortcuts({
  brandId,
  canEdit,
}: {
  brandId: string;
  canEdit: boolean;
}) {
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();

      if (k === "n" && canEdit) {
        e.preventDefault();
        router.push(`/brands/${brandId}/posts/new`);
        return;
      }
      if (k === "b" && canEdit) {
        e.preventDefault();
        const btn = document.querySelector<HTMLButtonElement>('button[title^="Subir varias"]');
        btn?.click();
        return;
      }
      const status = FILTER_BY_NUM[e.key];
      if (status) {
        e.preventDefault();
        const url =
          status === "all"
            ? `/brands/${brandId}`
            : `/brands/${brandId}?status=${status}`;
        router.push(url);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [brandId, canEdit, router]);

  return null;
}
