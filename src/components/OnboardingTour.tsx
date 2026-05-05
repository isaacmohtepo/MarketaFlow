"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Bell,
  CheckCircle2,
  Keyboard,
  Layers,
  Sparkles,
  X,
} from "lucide-react";
import { useModKey } from "@/lib/platform";

const KEY = "mf:onboarding:done";

type Step = {
  icon: typeof Sparkles;
  title: string;
  body: (mod: string) => string;
  cta?: { label: string; href: string };
};

const STEPS: Step[] = [
  {
    icon: Sparkles,
    title: "Bienvenido a MarketaFlow",
    body: () => "Aprobación de contenido sin caos. Te muestro lo esencial en 30 segundos.",
  },
  {
    icon: Layers,
    title: "Cada cliente, una marca",
    body: () =>
      "Crea una marca por cada cliente. Cada una tiene su propio feed, equipo y aprobaciones. Empezá creando la primera desde el dashboard.",
    cta: { label: "Ir a Marcas", href: "/brands" },
  },
  {
    icon: CheckCircle2,
    title: "Aprobación sin fricción",
    body: () =>
      "Tu cliente abre un link sin registrarse, comenta sobre la imagen y aprueba con un click. Activá el link público desde Settings de la marca.",
  },
  {
    icon: Bell,
    title: "Todo en tiempo real",
    body: () =>
      "Comentarios, aprobaciones y menciones llegan al instante. Activa las notificaciones de escritorio en /account si querés enterarte aunque estés en otra pestaña.",
    cta: { label: "Configurar notificaciones", href: "/account" },
  },
  {
    icon: Keyboard,
    title: "Atajos para ir más rápido",
    body: (mod) =>
      `Pulsá ${mod}+K para buscar y navegar, o ? en cualquier parte para ver todos los atajos. ¡A volar!`,
  },
];

export default function OnboardingTour() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const mod = useModKey();

  useEffect(() => {
    try {
      const done = localStorage.getItem(KEY);
      if (!done) {
        // Pequeño delay para que la página se asiente antes del tour
        const id = setTimeout(() => setOpen(true), 800);
        return () => clearTimeout(id);
      }
    } catch {}
  }, []);

  function close(complete: boolean) {
    if (complete) {
      try {
        localStorage.setItem(KEY, new Date().toISOString());
      } catch {}
    }
    setOpen(false);
  }

  if (!open) return null;

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm sm:items-center"
      onClick={() => close(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-2xl"
      >
        <div className="relative">
          {/* Progress dots */}
          <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
            <div className="flex gap-1">
              {STEPS.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i === step ? "w-5 brand-gradient" : i < step ? "w-1.5 bg-fuchsia-300" : "w-1.5 bg-zinc-200"
                  }`}
                />
              ))}
            </div>
            <button
              onClick={() => close(false)}
              className="grid h-6 w-6 place-items-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
              aria-label="Cerrar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Hero gradient */}
          <div
            aria-hidden
            className="h-2 brand-gradient"
            style={{ backgroundSize: "200% 200%", animation: "gradient-pan 8s ease-in-out infinite" }}
          />

          <div className="p-6">
            <span className="grid h-12 w-12 place-items-center rounded-2xl brand-gradient text-white shadow-lg">
              <Icon className="h-6 w-6" />
            </span>
            <h2 className="mt-4 text-[18px] font-bold tracking-tight text-zinc-900">
              {current.title}
            </h2>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-zinc-600">
              {current.body(mod)}
            </p>

            {current.cta && (
              <Link
                href={current.cta.href}
                onClick={() => close(true)}
                className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                {current.cta.label}
                <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-zinc-100 bg-zinc-50/40 px-4 py-3">
            <button
              onClick={() => close(true)}
              className="text-[11.5px] font-medium text-zinc-500 hover:text-zinc-900"
            >
              Saltar tour
            </button>
            <div className="flex items-center gap-2">
              {step > 0 && (
                <button
                  onClick={() => setStep((s) => Math.max(0, s - 1))}
                  className="rounded-md px-3 py-1.5 text-[12px] font-medium text-zinc-600 hover:text-zinc-900"
                >
                  Atrás
                </button>
              )}
              <button
                onClick={() => {
                  if (isLast) close(true);
                  else setStep((s) => Math.min(STEPS.length - 1, s + 1));
                }}
                className="btn-gradient inline-flex items-center gap-1 rounded-md px-4 py-1.5 text-[12px] font-semibold"
              >
                {isLast ? "Empezar" : "Siguiente"}
                <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
