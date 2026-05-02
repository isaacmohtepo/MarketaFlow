"use client";

import { useRouter } from "next/navigation";
import NotificationsBell from "./NotificationsBell";
import SearchBox from "./SearchBox";
import { LogOut, Menu } from "lucide-react";

export default function TopBar({
  userName,
  title,
  onMobileMenu,
}: {
  userName: string;
  title?: string;
  onMobileMenu?: () => void;
}) {
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }
  const initials = userName
    .split(/[ @]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
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
        <span
          className="grid h-7 w-7 place-items-center rounded-full text-[10px] font-semibold text-white brand-gradient"
          title={userName}
        >
          {initials || "?"}
        </span>
        <button
          onClick={logout}
          className="grid h-7 w-7 place-items-center rounded-md border border-[var(--line)] bg-white text-zinc-600 hover:bg-zinc-100"
          aria-label="Salir"
          title="Salir"
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>
      </div>
    </header>
  );
}
