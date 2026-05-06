"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Loader2, Users } from "lucide-react";
import { toast } from "sonner";

const AUDIENCES = [
  { id: "all", label: "Todos los usuarios" },
  { id: "agencies", label: "Solo agencies" },
  { id: "clients", label: "Solo clients" },
  { id: "trial_ending", label: "Trials por terminar (próximos 7 días)" },
  { id: "past_due", label: "Subs con pago vencido (past_due)" },
] as const;

export default function BroadcastEditor() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [audience, setAudience] = useState<typeof AUDIENCES[number]["id"]>("all");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState(
    `<p>Hola {{name}},</p>\n<p></p>\n<p>Saludos,<br/>Equipo MarketaFlow</p>`,
  );
  const [audienceCount, setAudienceCount] = useState<number | null>(null);

  // Cargar count cuando cambia audience
  useEffect(() => {
    setAudienceCount(null);
    fetch(`/api/admin/broadcasts?previewAudience=${audience}`)
      .then((r) => r.json())
      .then((j) => setAudienceCount(j.count ?? 0))
      .catch(() => setAudienceCount(null));
  }, [audience]);

  async function saveDraft() {
    if (!subject || !bodyHtml) {
      toast.error("Subject y cuerpo son obligatorios");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/broadcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, bodyHtml, audience }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j.error ?? "Error");
        return;
      }
      toast.success("Borrador guardado");
      router.push(`/admin/communications/${j.broadcast.id}`);
    } catch {
      toast.error("Error de red");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card p-6">
        <h1 className="text-base font-bold text-zinc-900">Nuevo broadcast</h1>
        <p className="mt-0.5 text-[12px] text-zinc-500">
          Creá el borrador. Vas a poder previsualizar y enviar desde la
          siguiente pantalla.
        </p>

        <div className="mt-5 space-y-4">
          <Field label="Audiencia">
            <select
              value={audience}
              onChange={(e) => setAudience(e.currentTarget.value as never)}
              className="input-soft w-full rounded-md px-3 py-2 text-[13px]"
            >
              {AUDIENCES.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
            <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-zinc-500">
              <Users className="h-3 w-3" />
              {audienceCount === null
                ? "Calculando…"
                : `${audienceCount} ${audienceCount === 1 ? "destinatario" : "destinatarios"} cumplen los criterios`}
            </div>
          </Field>

          <Field label="Subject del email">
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.currentTarget.value)}
              placeholder="Ej: Nuevas features esta semana en MarketaFlow"
              maxLength={150}
              className="input-soft w-full rounded-md px-3 py-2 text-[13px]"
            />
          </Field>

          <Field label="Cuerpo (HTML)">
            <textarea
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.currentTarget.value)}
              rows={14}
              className="input-soft w-full rounded-md px-3 py-2 font-mono text-[12px]"
              placeholder="<p>Hola {{name}},</p>..."
            />
            <p className="mt-1 text-[10.5px] text-zinc-500">
              Variables disponibles: <code className="rounded bg-zinc-100 px-1">{"{{name}}"}</code>{" "}
              (cae a "amigo/a" si el user no tiene nombre).
            </p>
          </Field>

          {/* Preview */}
          <div className="rounded-lg border border-zinc-200 bg-zinc-50/40 p-4">
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-zinc-400">
              Preview
            </p>
            <p className="mt-1 text-[13px] font-bold text-zinc-900">
              {subject || "(sin subject)"}
            </p>
            <div
              className="prose prose-sm mt-2 max-w-none text-[12px] text-zinc-700 [&_p]:my-1"
              dangerouslySetInnerHTML={{ __html: bodyHtml.replace(/\{\{name\}\}/g, "Isaac") }}
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={saveDraft}
            disabled={busy}
            className="btn-gradient inline-flex items-center gap-2 rounded-md px-4 py-2 text-[13px] font-semibold disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Guardar borrador
          </button>
        </div>
      </div>
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
