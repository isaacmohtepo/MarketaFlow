"use client";

import NotificationsBell from "./NotificationsBell";
import SearchBox from "./SearchBox";
import UserMenu from "./UserMenu";
import { Menu } from "lucide-react";

export default function TopBar({
  userName,
  userEmail,
  avatarUrl,
  title,
  isOwner = false,
  isAdmin = false,
  onMobileMenu,
}: {
  userName: string;
  userEmail: string;
  avatarUrl?: string | null;
  title?: string;
  isOwner?: boolean;
  isAdmin?: boolean;
  onMobileMenu?: () => void;
}) {
  return (
    <header
      className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b divider px-3 sm:gap-3 sm:px-5"
      style={{ background: "var(--bg-app)" }}
    >
      {onMobileMenu && (
        <button
          onClick={onMobileMenu}
          aria-label="Abrir menú"
          className="grid h-8 w-8 place-items-center rounded-md btn-secondary text-zinc-700 lg:hidden"
        >
          <Menu className="h-4 w-4" />
        </button>
      )}
      <h1 className="truncate text-[14px] font-semibold tracking-tight text-zinc-900">
        {title ?? ""}
      </h1>
      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <SearchBox />
        <NotificationsBell />
        {/* Avatar ahora es un menú dropdown con mi-cuenta / billing /
            white-label / admin / cerrar-sesión. Antes era solo una imagen
            sin click + botón separado de logout. */}
        <UserMenu
          userName={userName}
          userEmail={userEmail}
          avatarUrl={avatarUrl}
          isOwner={isOwner}
          isAdmin={isAdmin}
        />
      </div>
    </header>
  );
}
