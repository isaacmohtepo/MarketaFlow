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
