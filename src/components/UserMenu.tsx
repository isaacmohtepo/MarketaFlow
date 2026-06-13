"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  User as UserIcon,
  Settings,
  CreditCard,
  Sparkles,
  HelpCircle,
  LogOut,
  Shield,
  Loader2,
  ChevronDown,
} from "lucide-react";

/**
 * Dropdown menu que se despliega al clickear el avatar del user.
 *
 * Items:
 *  - Header con avatar + nombre + email
 *  - Mi cuenta → /account
 *  - Facturación → /billing  (solo si es owner; sino oculto)
 *  - White-label → /account/white-label  (solo si su agency lo tiene)
 *  - Admin → /admin (solo si isAdmin)
 *  - Ayuda → /help
 *  - Cerrar sesión
 *
 * El componente recibe flags isOwner/isAdmin desde el shell para evitar
 * fetch extra al montar.
 */
export default function UserMenu({
  userName,
  userEmail,
  avatarUrl,
  isOwner,
  isAdmin,
}: {
  userName: string;
  userEmail: string;
  avatarUrl?: string | null;
  isOwner: boolean;
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Cerrar al clickear afuera o tocar Escape
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", onDocClick);
      document.addEventListener("keydown", onKey);
    }
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function logout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      // Navegación DURA (no router.push): fuerza una recarga completa para
      // limpiar el <style> de white-label inyectado en el layout (app) y todo
      // el estado de sesión. Con soft-nav el branding de la marca quedaba
      // pegado en la landing/login hasta recargar a mano.
      window.location.href = "/";
    } catch {
      setLoggingOut(false);
    }
  }

  const initials = userName
    .split(/[ @]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full transition hover:opacity-90"
        aria-label="Menú de usuario"
        aria-expanded={open}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt={userName}
            className="h-7 w-7 flex-shrink-0 rounded-full object-cover ring-1 ring-zinc-200"
          />
        ) : (
          <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full text-3xs font-semibold text-white brand-gradient">
            {initials || "?"}
          </span>
        )}
        <ChevronDown
          className={`hidden h-3 w-3 text-zinc-500 transition-transform sm:block ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-xl border border-zinc-100 bg-white shadow-2xl">
          {/* Header del usuario */}
          <div className="flex items-center gap-3 border-b border-zinc-100 px-4 py-3">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt={userName}
                className="h-10 w-10 flex-shrink-0 rounded-full object-cover ring-1 ring-zinc-200"
              />
            ) : (
              <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full text-[13px] font-semibold text-white brand-gradient">
                {initials || "?"}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-zinc-900">
                {userName}
              </p>
              <p className="truncate text-2xs text-zinc-500">{userEmail}</p>
            </div>
          </div>

          {/* Items */}
          <nav className="py-1">
            <Item
              href="/account"
              icon={<UserIcon className="h-3.5 w-3.5" />}
              onClick={() => setOpen(false)}
            >
              Mi cuenta
            </Item>
            {isOwner && (
              <Item
                href="/billing"
                icon={<CreditCard className="h-3.5 w-3.5" />}
                onClick={() => setOpen(false)}
              >
                Facturación
              </Item>
            )}
            <Item
              href="/account/white-label"
              icon={<Sparkles className="h-3.5 w-3.5" />}
              onClick={() => setOpen(false)}
            >
              White-label
            </Item>
            <Item
              href="/help"
              icon={<HelpCircle className="h-3.5 w-3.5" />}
              onClick={() => setOpen(false)}
            >
              Ayuda
            </Item>
            {isAdmin && (
              <>
                <div className="my-1 border-t border-zinc-100" />
                <Item
                  href="/admin"
                  icon={<Shield className="h-3.5 w-3.5" />}
                  onClick={() => setOpen(false)}
                  tone="admin"
                >
                  Admin
                </Item>
              </>
            )}
            <div className="my-1 border-t border-zinc-100" />
            <button
              type="button"
              onClick={logout}
              disabled={loggingOut}
              className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-[12.5px] text-rose-600 transition hover:bg-rose-50 disabled:opacity-60"
            >
              {loggingOut ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <LogOut className="h-3.5 w-3.5" />
              )}
              Cerrar sesión
            </button>
          </nav>

          {/* Footer */}
          <div className="border-t border-zinc-100 bg-zinc-50/40 px-4 py-2">
            <Link
              href="/account?tab=security"
              onClick={() => setOpen(false)}
              className="flex items-center gap-1.5 text-[10.5px] text-zinc-500 transition hover:text-zinc-900"
            >
              <Settings className="h-3 w-3" />
              Privacidad y seguridad
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function Item({
  href,
  icon,
  children,
  onClick,
  tone,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
  tone?: "admin";
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center gap-2.5 px-4 py-2 text-[12.5px] transition ${
        tone === "admin"
          ? "text-fuchsia-700 hover:bg-fuchsia-50"
          : "text-zinc-700 hover:bg-zinc-50"
      }`}
    >
      {icon}
      {children}
    </Link>
  );
}
