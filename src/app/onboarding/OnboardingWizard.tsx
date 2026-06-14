"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Layers,
  UserPlus,
  CheckCircle2,
  ArrowRight,
  Loader2,
  SkipForward,
  X,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmDialog";

type Step = 0 | 1 | 2 | 3;

export default function OnboardingWizard({
  userName,
  agencyId,
  agencyName,
  existingBrandsCount,
  role = "owner",
}: {
  userName: string;
  agencyId: string;
  agencyName: string;
  existingBrandsCount: number;
  role?: string;
}) {
  void agencyId;
  const router = useRouter();
  const { confirm } = useConfirm();
  // Si ya tiene una marca creada, salteamos el paso 1
  const [step, setStep] = useState<Step>(existingBrandsCount > 0 ? 2 : 0);
  const [busy, setBusy] = useState(false);

  const isFullWizardRole = role === "owner" || role === "manager";

  // Paso 1: brand
  const [brand, setBrand] = useState({
    name: "",
    handle: "",
    color: "#8a2be2",
  });
  const [createdBrandId, setCreatedBrandId] = useState<string | null>(null);

  // Paso 2: invite
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");

  async function createBrand() {
    if (!brand.name.trim()) {
      toast.error("Ponele un nombre a la marca");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: brand.name.trim(),
          handle: brand.handle.trim() || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j.error ?? "No se pudo crear la marca");
        return;
      }
      setCreatedBrandId(j.brand?.id ?? j.id);
      toast.success(`Marca "${brand.name}" creada`);
      setStep(2);
    } catch {
      toast.error("Error de red");
    } finally {
      setBusy(false);
    }
  }

  async function inviteClient() {
    if (!inviteEmail.trim()) {
      toast.error("Email del cliente");
      return;
    }
    setBusy(true);
    try {
      // Por simplicidad, mandamos un team invite (que también puede ser de
      // role client). Para el cliente real podríamos crear un share token,
      // pero esta UX la dejamos en el flujo normal.
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: "editor",
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j.error ?? "No se pudo enviar la invitación");
        return;
      }
      toast.success(`Invitación enviada a ${inviteEmail}`);
      setStep(3);
    } catch {
      toast.error("Error de red");
    } finally {
      setBusy(false);
    }
  }

  async function complete() {
    setBusy(true);
    try {
      await fetch("/api/account/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: true }),
      });
      router.push(createdBrandId ? `/brands/${createdBrandId}` : "/dashboard");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function completeAndGoTo(path: string) {
    setBusy(true);
    try {
      await fetch("/api/account/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: true }),
      });
      router.push(path);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function skipAll() {
    const ok = await confirm({
      title: "¿Saltar el onboarding?",
      description: "Puedes volver más tarde abriendo /onboarding?force=1.",
      confirmLabel: "Saltar",
      cancelLabel: "Volver",
      variant: "default",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await fetch("/api/account/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: true }),
      });
      router.push("/dashboard");
    } finally {
      setBusy(false);
    }
  }

  if (!isFullWizardRole) {
    const roleScreens = roleWelcomeScreens(role, agencyName);
    return (
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 py-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg brand-gradient text-white shadow-sm">
              <Sparkles className="h-4 w-4" />
            </span>
            <span className="text-[14px] font-bold tracking-tight text-zinc-900">
              MarketaFlow
            </span>
          </div>
          <button
            type="button"
            onClick={skipAll}
            disabled={busy}
            className="inline-flex items-center gap-1 text-[12px] font-medium text-zinc-500 hover:text-zinc-900 disabled:opacity-50"
          >
            <SkipForward className="h-3 w-3" />
            Saltar
          </button>
        </div>
        <div className="mt-12 flex-1">
          <StepCard
            icon={<Sparkles className="h-6 w-6" />}
            title={`Hola, ${userName} 👋`}
            subtitle={roleScreens.subtitle}
          >
            <ul className="mt-6 space-y-3 text-[13px] text-zinc-700">
              {roleScreens.bullets.map((b, i) => (
                <Bullet key={i}>{b}</Bullet>
              ))}
            </ul>
            <PrimaryButton
              onClick={() => completeAndGoTo(roleScreens.cta.path)}
              disabled={busy}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {roleScreens.cta.label}
              <ArrowRight className="h-3.5 w-3.5" />
            </PrimaryButton>
          </StepCard>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 py-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg brand-gradient text-white shadow-sm">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="text-[14px] font-bold tracking-tight text-zinc-900">
            MarketaFlow
          </span>
        </div>
        <button
          type="button"
          onClick={skipAll}
          disabled={busy}
          className="inline-flex items-center gap-1 text-[12px] font-medium text-zinc-500 hover:text-zinc-900 disabled:opacity-50"
        >
          <SkipForward className="h-3 w-3" />
          Saltar
        </button>
      </div>

      {/* Progress steps */}
      <div className="mt-8 flex items-center justify-center gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center">
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full text-2xs font-bold transition ${
                i < step
                  ? "bg-emerald-500 text-white"
                  : i === step
                    ? "brand-gradient text-white shadow-sm"
                    : "bg-zinc-200 text-zinc-500"
              }`}
            >
              {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            {i < 3 && (
              <span
                className={`mx-1 h-0.5 w-8 transition ${
                  i < step ? "bg-emerald-500" : "bg-zinc-200"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Content */}
      <div className="mt-10 flex-1">
        {step === 0 && (
          <StepCard
            icon={<Sparkles className="h-6 w-6" />}
            title={`Hola, ${userName} 👋`}
            subtitle={`Bienvenido a MarketaFlow. Vamos a configurar ${agencyName} en menos de 2 minutos.`}
          >
            <ul className="mt-6 space-y-3 text-[13px] text-zinc-700">
              <Bullet>Vas a crear tu primera marca/cliente</Bullet>
              <Bullet>Invitas a un colaborador o cliente (opcional)</Bullet>
              <Bullet>Listo — empiezas a publicar y aprobar contenido</Bullet>
            </ul>
            <PrimaryButton onClick={() => setStep(1)} disabled={busy}>
              Empezar
              <ArrowRight className="h-3.5 w-3.5" />
            </PrimaryButton>
          </StepCard>
        )}

        {step === 1 && (
          <StepCard
            icon={<Layers className="h-6 w-6" />}
            title="Crea tu primera marca"
            subtitle="Cada cliente que manejes es una marca: feed propio, equipo y aprobaciones independientes."
          >
            <div className="mt-6 space-y-3">
              <Field label="Nombre de la marca *">
                <input
                  type="text"
                  value={brand.name}
                  onChange={(e) =>
                    setBrand({ ...brand, name: e.currentTarget.value })
                  }
                  placeholder="Ej: Café Aurora"
                  maxLength={80}
                  disabled={busy}
                  className="input-soft w-full rounded-md px-3 py-2 text-[13px]"
                  autoFocus
                />
              </Field>
              <Field label="Handle (opcional)">
                <input
                  type="text"
                  value={brand.handle}
                  onChange={(e) =>
                    setBrand({
                      ...brand,
                      handle: e.currentTarget.value
                        .toLowerCase()
                        .replace(/[^a-z0-9_]/g, ""),
                    })
                  }
                  placeholder="cafeaurora"
                  maxLength={30}
                  disabled={busy}
                  className="input-soft w-full rounded-md px-3 py-2 text-[13px]"
                />
              </Field>
            </div>
            <div className="mt-6 flex gap-2">
              <SecondaryButton onClick={() => setStep(0)} disabled={busy}>
                Atrás
              </SecondaryButton>
              <PrimaryButton onClick={createBrand} disabled={busy || !brand.name.trim()}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Crear marca
                <ArrowRight className="h-3.5 w-3.5" />
              </PrimaryButton>
            </div>
          </StepCard>
        )}

        {step === 2 && (
          <StepCard
            icon={<UserPlus className="h-6 w-6" />}
            title="Invita al equipo o al cliente"
            subtitle="Mve una invitación para que un colaborador se sume. Puedes saltarte este paso y hacerlo más tarde."
          >
            <div className="mt-6 space-y-3">
              <Field label="Email">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.currentTarget.value)}
                  placeholder="cliente@empresa.com"
                  disabled={busy}
                  className="input-soft w-full rounded-md px-3 py-2 text-[13px]"
                  autoFocus
                />
              </Field>
              <Field label="Nombre (opcional)">
                <input
                  type="text"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.currentTarget.value)}
                  placeholder="María López"
                  disabled={busy}
                  className="input-soft w-full rounded-md px-3 py-2 text-[13px]"
                />
              </Field>
              <p className="text-2xs text-zinc-500">
                Le va a llegar un email con un link para sumarse. Podrá revisar
                posts y aprobarlos.
              </p>
            </div>
            <div className="mt-6 flex gap-2">
              <SecondaryButton onClick={() => setStep(3)} disabled={busy}>
                <X className="h-3 w-3" />
                Saltar este paso
              </SecondaryButton>
              <PrimaryButton onClick={inviteClient} disabled={busy || !inviteEmail.trim()}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Enviar invitación
                <ArrowRight className="h-3.5 w-3.5" />
              </PrimaryButton>
            </div>
          </StepCard>
        )}

        {step === 3 && (
          <StepCard
            icon={<CheckCircle2 className="h-6 w-6" />}
            title="¡Todo listo!"
            subtitle="Tu workspace está armado. Empieza a subir tu primer post."
          >
            <ul className="mt-6 space-y-3 text-[13px] text-zinc-700">
              <Bullet good>Marca creada</Bullet>
              {inviteEmail && <Bullet good>Invitación enviada</Bullet>}
              <Bullet good>Listo para subir contenido</Bullet>
            </ul>
            <div className="mt-6 rounded-lg border border-fuchsia-200 bg-fuchsia-50/40 p-3 text-[12px] text-zinc-700">
              <strong>Tip:</strong> usa <kbd className="rounded bg-white px-1.5 py-0.5 text-[10.5px] font-mono">Cmd+K</kbd>{" "}
              en cualquier parte para buscar y navegar rápido.
            </div>
            <PrimaryButton onClick={complete} disabled={busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Ir a la marca
              <ArrowRight className="h-3.5 w-3.5" />
            </PrimaryButton>
          </StepCard>
        )}
      </div>
    </div>
  );
}

function StepCard({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="brand-gradient h-1.5" />
      <div className="p-7">
        <span className="grid h-12 w-12 place-items-center rounded-2xl brand-gradient text-white shadow-lg">
          {icon}
        </span>
        <h1 className="mt-5 text-[22px] font-bold tracking-tight text-zinc-900">
          {title}
        </h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-zinc-600">
          {subtitle}
        </p>
        {children}
      </div>
    </div>
  );
}

function Bullet({
  children,
  good,
}: {
  children: React.ReactNode;
  good?: boolean;
}) {
  return (
    <li className="flex items-start gap-2">
      <span
        className={`mt-0.5 grid h-4 w-4 flex-shrink-0 place-items-center rounded-full ${
          good ? "bg-emerald-500" : "bg-fuchsia-100"
        }`}
      >
        {good ? (
          <Check className="h-2.5 w-2.5 text-white" />
        ) : (
          <span className="h-1 w-1 rounded-full bg-fuchsia-500" />
        )}
      </span>
      <span>{children}</span>
    </li>
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

function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="btn-gradient mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 text-[13px] font-semibold disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function roleWelcomeScreens(
  role: string,
  agencyName: string,
): {
  subtitle: string;
  bullets: string[];
  cta: { label: string; path: string };
} {
  switch (role) {
    case "community_manager":
      return {
        subtitle: `${agencyName} te invitó como Community Manager. Tu primer trabajo es crear o seleccionar un post para empezar.`,
        bullets: [
          "Vas a ver el feed de cada marca y los posts pendientes",
          "Puedes crear, editar y programar posts",
          "Coordinas con designers y copywriters por comentarios",
        ],
        cta: { label: "Ir al feed", path: "/brands" },
      };
    case "designer":
      return {
        subtitle: `${agencyName} te invitó como Diseñador/a. Tu trabajo en MarketaFlow es subir creativos.`,
        bullets: [
          "Vas a ver los posts pendientes de cada marca",
          "Subes imágenes y videos en cada post",
          "El Community Manager te avisa qué se necesita",
        ],
        cta: { label: "Ver mis marcas", path: "/brands" },
      };
    case "copywriter":
      return {
        subtitle: `${agencyName} te invitó como Copywriter. Tu trabajo en MarketaFlow es escribir captions.`,
        bullets: [
          "Vas a ver los posts pendientes de caption",
          "Editas caption y hashtags directamente en cada post",
          "Coordinas con el equipo por comentarios",
        ],
        cta: { label: "Ver mis marcas", path: "/brands" },
      };
    case "strategist":
      return {
        subtitle: `${agencyName} te invitó como Estratega. Aquí ves dashboards y dejas notas estratégicas.`,
        bullets: [
          "Dashboard con KPIs y reportes de las marcas",
          "Comentas en posts para dejar notas",
          "Accedes al historial de actividad",
        ],
        cta: { label: "Ir al dashboard", path: "/dashboard" },
      };
    case "client":
      return {
        subtitle: `${agencyName} te invitó a aprobar contenido en MarketaFlow.`,
        bullets: [
          "Vas a ver los posts que te mandan para revisar",
          "Apruebas o pides cambios con un click",
          "Comentas puntos específicos sobre cada imagen",
        ],
        cta: { label: "Ver mis posts", path: "/dashboard" },
      };
    default:
      return {
        subtitle: `${agencyName} te invitó a MarketaFlow.`,
        bullets: ["Empieza a explorar tu workspace"],
        cta: { label: "Ir al dashboard", path: "/dashboard" },
      };
  }
}

function SecondaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="btn-secondary inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[12.5px] font-semibold disabled:opacity-50"
    >
      {children}
    </button>
  );
}
