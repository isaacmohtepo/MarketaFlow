"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, Loader2, Trash2, User as UserIcon } from "lucide-react";

export default function ProfileEditor({
  initial,
}: {
  initial: { name: string | null; avatarUrl: string | null };
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initial.name ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initial.avatarUrl);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const dirty =
    (name.trim() !== (initial.name ?? "")) || avatarUrl !== initial.avatarUrl;

  async function uploadAvatar(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("El archivo debe ser una imagen.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("La imagen debe pesar menos de 5MB.");
      return;
    }
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const r = await fetch("/api/upload", { method: "POST", body: fd });
      if (!r.ok) {
        setError("No se pudo subir la imagen.");
        return;
      }
      const j = await r.json();
      setAvatarUrl(j.url);
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const r = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || null, avatarUrl }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.error ?? "No se pudo guardar.");
        return;
      }
      setSavedAt(Date.now());
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const initials = (name || initial.name || "?").trim().charAt(0).toUpperCase();

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="relative">
          <span className="grid h-16 w-16 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-blue-100 via-fuchsia-100 to-rose-100 text-[20px] font-bold text-zinc-700 ring-1 ring-zinc-100">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <UserIcon className="h-6 w-6 text-zinc-400" />
            )}
          </span>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full bg-zinc-900 text-white shadow-sm hover:bg-zinc-700 disabled:opacity-60"
            aria-label="Cambiar foto"
            title="Cambiar foto"
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadAvatar(f);
              e.target.value = "";
            }}
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-2xs font-semibold uppercase tracking-wider text-zinc-500">
            Iniciales
          </p>
          <p className="mt-1 text-[14px] font-semibold text-zinc-700">{initials}</p>
          {avatarUrl && (
            <button
              type="button"
              onClick={() => setAvatarUrl(null)}
              className="mt-1 inline-flex items-center gap-1 text-2xs font-medium text-zinc-500 hover:text-rose-600"
            >
              <Trash2 className="h-3 w-3" />
              Quitar foto
            </button>
          )}
        </div>
      </div>

      <div>
        <label className="block text-[12px] font-medium text-zinc-700">Nombre</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          placeholder="Cómo quieres que te vean"
          className="mt-1 w-full rounded-md input-soft px-3 py-2 text-[13px]"
        />
      </div>

      {error && <p className="text-[12px] text-rose-600">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        {savedAt && Date.now() - savedAt < 4000 && (
          <span className="inline-flex items-center gap-1 text-2xs font-medium text-emerald-600">
            <Check className="h-3 w-3" />
            Guardado
          </span>
        )}
        <button
          onClick={save}
          disabled={!dirty || saving || uploading}
          className="btn-gradient inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-[12px] font-semibold disabled:opacity-50"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Guardar cambios
        </button>
      </div>
    </div>
  );
}
