"use client";

import { useEffect, useState } from "react";
import { Bell, Volume2, VolumeX, Monitor, AlertCircle, Check } from "lucide-react";

const SOUND_KEY = "mf:notif:sound";
const DESKTOP_KEY = "mf:notif:desktop";

type Permission = "default" | "granted" | "denied" | "unsupported";

function getDesktopPermission(): Permission {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission as Permission;
}

export default function InAppNotifPrefs() {
  const [soundOn, setSoundOn] = useState(true);
  const [desktopOn, setDesktopOn] = useState(true);
  const [permission, setPermission] = useState<Permission>("default");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const s = localStorage.getItem(SOUND_KEY);
      const d = localStorage.getItem(DESKTOP_KEY);
      if (s !== null) setSoundOn(s === "1");
      if (d !== null) setDesktopOn(d === "1");
    } catch {}
    setPermission(getDesktopPermission());
    setHydrated(true);
  }, []);

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    try {
      localStorage.setItem(SOUND_KEY, next ? "1" : "0");
    } catch {}
    if (next) {
      // Preview rapido
      previewPing();
    }
  }

  async function toggleDesktop() {
    const next = !desktopOn;
    if (next && permission === "default") {
      try {
        const p = await Notification.requestPermission();
        setPermission(p as Permission);
        if (p !== "granted") return;
      } catch {
        return;
      }
    }
    setDesktopOn(next);
    try {
      localStorage.setItem(DESKTOP_KEY, next ? "1" : "0");
    } catch {}
  }

  function testDesktop() {
    if (permission !== "granted") return;
    try {
      new Notification("MarketaFlow", {
        body: "¡Las notificaciones de escritorio están funcionando!",
        icon: "/favicon.ico",
      });
    } catch {}
  }

  if (!hydrated) return null;

  return (
    <div className="space-y-3">
      {/* Sonido */}
      <div className="flex items-start justify-between gap-3 rounded-lg border border-zinc-100 p-3">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <span className={`grid h-8 w-8 flex-shrink-0 place-items-center rounded-md ${soundOn ? "bg-fuchsia-50 text-fuchsia-600" : "bg-zinc-100 text-zinc-500"}`}>
            {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-zinc-900">Sonido</p>
            <p className="text-[11.5px] text-zinc-500">
              Reproduce un ping breve cuando llega una notificación nueva.
            </p>
          </div>
        </div>
        <Toggle on={soundOn} onChange={toggleSound} />
      </div>

      {/* Desktop notifications */}
      <div className="flex items-start justify-between gap-3 rounded-lg border border-zinc-100 p-3">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <span className={`grid h-8 w-8 flex-shrink-0 place-items-center rounded-md ${desktopOn && permission === "granted" ? "bg-blue-50 text-blue-600" : "bg-zinc-100 text-zinc-500"}`}>
            <Monitor className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-zinc-900">Notificaciones de escritorio</p>
            <p className="text-[11.5px] text-zinc-500">
              Muestra una notificación del sistema cuando estás en otra pestaña.
            </p>
            {permission === "denied" && (
              <p className="mt-1 inline-flex items-center gap-1 text-[10.5px] font-medium text-rose-600">
                <AlertCircle className="h-3 w-3" />
                Bloqueadas en este browser. Habilítalas en la configuración del sitio.
              </p>
            )}
            {permission === "unsupported" && (
              <p className="mt-1 text-[10.5px] text-zinc-500">
                Tu browser no soporta esta función.
              </p>
            )}
            {permission === "granted" && desktopOn && (
              <button
                onClick={testDesktop}
                className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50"
              >
                <Check className="h-3 w-3" />
                Enviar una de prueba
              </button>
            )}
          </div>
        </div>
        <Toggle
          on={desktopOn && permission === "granted"}
          onChange={toggleDesktop}
          disabled={permission === "denied" || permission === "unsupported"}
        />
      </div>

      <p className="flex items-start gap-1.5 text-[11px] text-zinc-500">
        <Bell className="mt-0.5 h-3 w-3 flex-shrink-0" />
        Estas preferencias se guardan en este navegador. Si usas otro dispositivo, configúralas allí también.
      </p>
    </div>
  );
}

function Toggle({
  on,
  onChange,
  disabled,
}: {
  on: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition ${
        on ? "bg-fuchsia-500" : "bg-zinc-200"
      } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
          on ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

// Preview del ping (mismo perfil que NotificationsBell, pero standalone para feedback inmediato)
let _audioCtx: AudioContext | null = null;
function previewPing() {
  try {
    if (typeof window === "undefined") return;
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (!_audioCtx) _audioCtx = new Ctx();
    const ctx = _audioCtx;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.07);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.42);
  } catch {}
}
