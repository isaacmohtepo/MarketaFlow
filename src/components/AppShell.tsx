"use client";

import { ReactNode, useState } from "react";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import ShortcutsOverlay from "./ShortcutsOverlay";
import CommandPalette from "./CommandPalette";
import NotificationToaster from "./NotificationToaster";
import OnboardingTour from "./OnboardingTour";

export default function AppShell({
  userName,
  avatarUrl,
  agencyName,
  title,
  isAdmin = false,
  isOwner = false,
  children,
}: {
  userName: string;
  avatarUrl?: string | null;
  agencyName: string | null;
  title?: string;
  isAdmin?: boolean;
  isOwner?: boolean;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div
      className="relative flex min-h-screen flex-1"
      style={{ background: "var(--bg-app)" }}
    >
      {/* Sidebar fijo en desktop */}
      <Sidebar agencyName={agencyName} isAdmin={isAdmin} isOwner={isOwner} />

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
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
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
