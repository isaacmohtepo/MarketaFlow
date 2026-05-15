"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AtSign as Instagram,
  Loader2,
  Check,
  ExternalLink,
  Unplug,
} from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmDialog";

export default function InstagramConnector({
  brandId,
  connected,
  currentIgUserId,
  needsReconnect,
}: {
  brandId: string;
  connected: boolean;
  currentIgUserId: string | null;
  needsReconnect?: boolean;
}) {
  const router = useRouter();
  const { confirm } = useConfirm();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    igUserId: currentIgUserId ?? "",
    igAccessToken: "",
  });
  const [verifiedUsername, setVerifiedUsername] = useState<string | null>(null);

  async function connect() {
    if (!form.igUserId.trim() || !form.igAccessToken.trim()) {
      toast.error("Completá los 2 campos");
      return;
    }
    setBusy(true);
    setVerifiedUsername(null);
    try {
      const res = await fetch(`/api/brands/${brandId}/instagram`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j.error ?? "Error al conectar");
        return;
      }
      setVerifiedUsername(j.username ?? null);
      toast.success(
        j.username ? `Conectado a @${j.username}` : "Cuenta conectada",
      );
      router.refresh();
    } catch {
      toast.error("Error de red");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    const ok = await confirm({
      title: "¿Desconectar Instagram?",
      description:
        "La marca dejará de poder publicar automáticamente. Las credenciales se borran de la DB. Podés volver a conectar después.",
      confirmLabel: "Desconectar",
      cancelLabel: "Cancelar",
      variant: "warning",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/brands/${brandId}/instagram`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error("Error al desconectar");
        return;
      }
      toast.success("Instagram desconectado");
      setForm({ igUserId: "", igAccessToken: "" });
      setVerifiedUsername(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Banner: token caducado, hay que reconectar */}
      {needsReconnect && connected && (
        <div className="card border-rose-300 bg-rose-50/60 p-4">
          <p className="text-[13px] font-bold text-rose-900">
            Reconectá Instagram
          </p>
          <p className="mt-1 text-[12px] text-rose-800">
            El token de acceso caducó o fue revocado. Mientras no se
            reconecte, los posts programados no se van a publicar. Click
            en "Conectar con Instagram" abajo para arreglarlo.
          </p>
        </div>
      )}
      {/* Estado actual */}
      {connected && (
        <div className="card flex items-center justify-between gap-3 border-emerald-200 bg-emerald-50/40 p-4">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-emerald-500 text-white">
              <Check className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[13px] font-bold text-zinc-900">
                Instagram conectado
              </p>
              <p className="text-[11.5px] text-zinc-500 font-mono">
                IG User ID: {currentIgUserId}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={disconnect}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Unplug className="h-3 w-3" />
            )}
            Desconectar
          </button>
        </div>
      )}

      {/* OAuth flow (preferido) */}
      <section className="card border-fuchsia-200 bg-gradient-to-br from-fuchsia-50/40 via-white to-amber-50/30 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-zinc-900">
              Conectar con un click
            </h2>
            <p className="mt-0.5 text-[12px] text-zinc-600">
              Te redirigimos a Meta, autorizás los permisos, y volvés con la
              cuenta conectada. Sin pegar tokens manualmente.
            </p>
          </div>
          <a
            href={`/api/instagram/oauth/start?brandId=${brandId}`}
            className="btn-gradient inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-[13px] font-semibold"
          >
            <Instagram className="h-3.5 w-3.5" />
            Conectar con Instagram
          </a>
        </div>
        <p className="mt-3 text-[10.5px] text-zinc-500">
          Requiere que el admin de la plataforma haya configurado{" "}
          <code className="rounded bg-zinc-100 px-1">META_APP_ID</code> y{" "}
          <code className="rounded bg-zinc-100 px-1">META_APP_SECRET</code> en
          Vercel. Si no, usá la conexión manual abajo.
        </p>
      </section>

      {/* Form manual */}
      <section className="card p-6">
        <h2 className="text-sm font-semibold text-zinc-900">
          {connected ? "Reemplazar credenciales (manual)" : "Conexión manual"}
        </h2>
        <p className="mt-1 text-[12px] text-zinc-500">
          Necesitás un{" "}
          <strong>Instagram Business Account ID</strong> y un{" "}
          <strong>long-lived access token</strong> de Meta con los permisos:{" "}
          <code className="rounded bg-zinc-100 px-1 text-[10.5px]">instagram_basic</code>
          ,{" "}
          <code className="rounded bg-zinc-100 px-1 text-[10.5px]">instagram_content_publish</code>
          ,{" "}
          <code className="rounded bg-zinc-100 px-1 text-[10.5px]">pages_show_list</code>
          ,{" "}
          <code className="rounded bg-zinc-100 px-1 text-[10.5px]">business_management</code>
          .
        </p>

        <div className="mt-5 space-y-3">
          <Field label="Instagram Business Account ID">
            <input
              type="text"
              value={form.igUserId}
              onChange={(e) =>
                setForm({ ...form, igUserId: e.currentTarget.value.trim() })
              }
              placeholder="17841401234567890"
              disabled={busy}
              className="input-soft w-full rounded-md px-3 py-2 text-[13px] font-mono"
            />
            <p className="mt-1 text-[10.5px] text-zinc-500">
              No es el @username — es un número largo. Lo encontrás en Meta
              Business Suite → Configuración → Cuentas → Instagram.
            </p>
          </Field>

          <Field label="Long-lived Access Token">
            <input
              type="password"
              value={form.igAccessToken}
              onChange={(e) =>
                setForm({ ...form, igAccessToken: e.currentTarget.value })
              }
              placeholder="EAAxxxxxxxxxxxxx..."
              disabled={busy}
              className="input-soft w-full rounded-md px-3 py-2 text-[13px] font-mono"
              autoComplete="off"
            />
            <p className="mt-1 text-[10.5px] text-zinc-500">
              Token que dura 60 días. Obtenelo desde{" "}
              <a
                href="https://developers.facebook.com/tools/explorer/"
                target="_blank"
                className="text-fuchsia-600 hover:underline"
                rel="noopener noreferrer"
              >
                Graph API Explorer
              </a>{" "}
              o haciendo el flow OAuth con tu app de Meta.
            </p>
          </Field>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={connect}
              disabled={
                busy ||
                !form.igUserId.trim() ||
                !form.igAccessToken.trim()
              }
              className="btn-gradient inline-flex items-center gap-2 rounded-md px-4 py-2 text-[13px] font-semibold disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Instagram className="h-3.5 w-3.5" />
              )}
              {connected ? "Actualizar" : "Conectar"}
            </button>
          </div>

          {verifiedUsername && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50/40 p-3 text-[12px] text-emerald-900">
              <Check className="inline h-3.5 w-3.5" /> Verificado como{" "}
              <strong>@{verifiedUsername}</strong>
            </div>
          )}
        </div>
      </section>

      <section className="card p-6">
        <h2 className="text-sm font-semibold text-zinc-900">
          ¿Cómo obtengo estos datos?
        </h2>
        <ol className="mt-3 space-y-2 text-[12.5px] text-zinc-700 list-decimal pl-5">
          <li>
            Tenés que tener una{" "}
            <strong>cuenta Instagram Business o Creator</strong> conectada a
            una página de Facebook.
          </li>
          <li>
            Andá a{" "}
            <a
              href="https://developers.facebook.com/apps"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-fuchsia-600 hover:underline"
            >
              developers.facebook.com/apps
              <ExternalLink className="h-3 w-3" />
            </a>{" "}
            y creá una app tipo "Business".
          </li>
          <li>
            Agregá el producto "Instagram Graph API" + "Pages API".
          </li>
          <li>
            Generá un User Access Token con los permisos arriba mencionados.
          </li>
          <li>
            Convertilo a{" "}
            <strong>long-lived (60 días)</strong> con{" "}
            <code className="rounded bg-zinc-100 px-1 text-[10.5px]">
              GET /oauth/access_token?grant_type=fb_exchange_token
            </code>
            .
          </li>
          <li>
            Tu IG Business Account ID lo conseguís con{" "}
            <code className="rounded bg-zinc-100 px-1 text-[10.5px]">
              GET /{"{page-id}"}?fields=instagram_business_account
            </code>
            .
          </li>
        </ol>
        <p className="mt-3 text-[11px] text-zinc-500">
          Si necesitás ayuda con esto, escribinos a soporte@marketaflow.app y
          te guiamos en el setup.
        </p>
      </section>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[12px] font-semibold text-zinc-700">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
