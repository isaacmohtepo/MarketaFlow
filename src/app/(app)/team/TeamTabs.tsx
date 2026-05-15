"use client";

import { useState } from "react";
import { Users, Shield, ScrollText, Handshake } from "lucide-react";
import TeamManager from "./TeamManager";
import RolesManager from "./RolesManager";
import AuditViewer from "./AuditViewer";
import ClientsManager from "./ClientsManager";

export default function TeamTabs({
  canManageRoles,
  canInvite,
  canViewAudit,
  canInviteClients,
}: {
  canManageRoles: boolean;
  canInvite: boolean;
  canViewAudit: boolean;
  canInviteClients: boolean;
}) {
  const [tab, setTab] = useState<"members" | "clients" | "roles" | "audit">(
    "members",
  );
  return (
    <div>
      <div className="flex border-b divider">
        <TabBtn
          active={tab === "members"}
          onClick={() => setTab("members")}
          icon={<Users className="h-3.5 w-3.5" />}
          label="Miembros"
        />
        {canInviteClients && (
          <TabBtn
            active={tab === "clients"}
            onClick={() => setTab("clients")}
            icon={<Handshake className="h-3.5 w-3.5" />}
            label="Clientes"
          />
        )}
        {canManageRoles && (
          <TabBtn
            active={tab === "roles"}
            onClick={() => setTab("roles")}
            icon={<Shield className="h-3.5 w-3.5" />}
            label="Roles y permisos"
          />
        )}
        {canViewAudit && (
          <TabBtn
            active={tab === "audit"}
            onClick={() => setTab("audit")}
            icon={<ScrollText className="h-3.5 w-3.5" />}
            label="Auditoría"
          />
        )}
      </div>
      <div className="mt-6">
        {tab === "members" && <TeamManager canInvite={canInvite} />}
        {tab === "clients" && canInviteClients && <ClientsManager />}
        {tab === "roles" && canManageRoles && <RolesManager canManageRoles={canManageRoles} />}
        {tab === "audit" && canViewAudit && <AuditViewer />}
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
