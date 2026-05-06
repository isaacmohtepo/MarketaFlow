"use client";

import { useState } from "react";
import { Users, Shield } from "lucide-react";
import TeamManager from "./TeamManager";
import RolesManager from "./RolesManager";

export default function TeamTabs({
  canManageRoles,
  canInvite,
}: {
  canManageRoles: boolean;
  canInvite: boolean;
}) {
  const [tab, setTab] = useState<"members" | "roles">("members");
  return (
    <div>
      <div className="flex border-b divider">
        <TabBtn
          active={tab === "members"}
          onClick={() => setTab("members")}
          icon={<Users className="h-3.5 w-3.5" />}
          label="Miembros"
        />
        <TabBtn
          active={tab === "roles"}
          onClick={() => setTab("roles")}
          icon={<Shield className="h-3.5 w-3.5" />}
          label="Roles y permisos"
        />
      </div>
      <div className="mt-6">
        {tab === "members" && <TeamManager canInvite={canInvite} />}
        {tab === "roles" && <RolesManager canManageRoles={canManageRoles} />}
      </div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-[13px] font-semibold transition ${
        active
          ? "border-zinc-900 text-zinc-900"
          : "border-transparent text-zinc-500 hover:text-zinc-700"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
