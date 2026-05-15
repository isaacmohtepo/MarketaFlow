"use client";

import { ReactNode, useState } from "react";
import Sidebar, { type PlanCardData } from "./Sidebar";
import TopBar from "./TopBar";
import ShortcutsOverlay from "./ShortcutsOverlay";
import CommandPalette from "./CommandPalette";
import NotificationToaster from "./NotificationToaster";
import OnboardingTour from "./OnboardingTour";

/**
 * AppShell layout: sidebar (left) + topbar + banners + content.
 *
 * Los banners (impersonate, suspended, 2FA reminder) van en su propio slot
 * ARRIBA del main para que ocupen el 100% del ancho del área de contenido,
 * sin sufrir el padding del main. Sticky-positioned por encima del topbar.
 */
export default function AppShell({
  userName,
  avatarUrl,
  agencyName,
  brandName,
  brandLogoUrl,
  brandLogoMode,
  brandLogoHeight,
  brandHeaderAlign,
  title,
  isAdmin = false,
  isOwner = false,
  planCard = null,
  banners = null,
  children,
}: {
  userName: string;
  avatarUrl?: string | null;
  agencyName: string | null;
  /** Nombre del brand a mostrar en sidebar/topbar. Si null, "MarketaFlow". */
  brandName?: string | null;
  /** URL del logo custom. Si null, se usa el ícono Zap default. */
  brandLogoUrl?: string | null;
  /** Cómo renderizar el logo: "logo_and_text" (default), "logo_only", "text_only". */
  brandLogoMode?: "logo_and_text" | "logo_only" | "text_only" | null;
  /** Altura del logo en px en modo "logo_only" (20-56). */
  brandLogoHeight?: number | null;
  /** Alineación del header del sidebar. */
  brandHeaderAlign?: "left" | "center" | "right" | null;
  title?: string;
  isAdmin?: boolean;
  isOwner?: boolean;
  planCard?: PlanCardData | null;
  /// Banners renderizados antes del topbar, full-width edge-to-edge.
  /// Cada uno se pasa como ReactNode independiente para poder ser sticky.
  banners?: ReactNode;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div
      className="relative flex min-h-screen flex-1"
      style={{ background: "var(--bg-app)" }}
    >
      {/* Sidebar fijo en desktop */}
      <Sidebar
        agencyName={agencyName}
        brandName={brandName}
        brandLogoUrl={brandLogoUrl}
        brandLogoMode={brandLogoMode}
        brandLogoHeight={brandLogoHeight}
        brandHeaderAlign={brandHeaderAlign}
        isAdmin={isAdmin}
        isOwner={isOwner}
        planCard={planCard}
      />

      {/* Drawer mobile */}
      {mobileOpen && (
        <>
          <button
            aria-label="Cerrar menú"
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 w-64 lg:hidden">
            <Sidebar
              agencyName={agencyName}
              brandName={brandName}
              brandLogoUrl={brandLogoUrl}
              brandLogoMode={brandLogoMode}
              brandLogoHeight={brandLogoHeight}
              brandHeaderAlign={brandHeaderAlign}
              isMobile
              isAdmin={isAdmin}
              isOwner={isOwner}
              planCard={planCard}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Banners full-width — ANTES del topbar para que sean lo primero
            que ve el user y queden sticky encima de todo */}
        {banners}
        <TopBar
          userName={userName}
          avatarUrl={avatarUrl}
          title={title}
          onMobileMenu={() => setMobileOpen(true)}
        />
        <main className="flex-1 px-4 py-5 text-zinc-900 sm:px-6 sm:py-6">
          {children}
        </main>
      </div>
      <ShortcutsOverlay />
      <CommandPalette />
      <NotificationToaster />
      <OnboardingTour />
    </div>
  );
}
