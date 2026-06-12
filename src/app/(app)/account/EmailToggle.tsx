"use client";

import { useState } from "react";

export default function EmailToggle({ initial }: { initial: boolean }) {
  const [enabled, setEnabled] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    const next = !enabled;
    setEnabled(next);
    setSaving(true);
    await fetch("/api/account/email-prefs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emailNotifications: next }),
    });
    setSaving(false);
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-[13px] font-medium text-zinc-900">
          {enabled ? "Activadas" : "Desactivadas"}
        </p>
        <p className="text-2xs text-zinc-500">
          {saving ? "Guardando..." : "Cambia en cualquier momento."}
        </p>
      </div>
      <button
        type="button"
        onClick={toggle}
        role="switch"
        aria-checked={enabled}
        className={`relative h-6 w-11 flex-shrink-0 rounded-full transition ${
          enabled ? "brand-gradient" : "bg-zinc-200"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
            enabled ? "left-[22px]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}
