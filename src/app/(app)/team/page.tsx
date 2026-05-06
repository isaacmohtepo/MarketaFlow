import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getUserAgencyName } from "@/lib/agency";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import TeamTabs from "./TeamTabs";

export default async function TeamPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const agencyName = await getUserAgencyName(user.id);

  const m = await prisma.membership.findFirst({
    where: { userId: user.id, brandId: null },
    select: { agencyId: true },
  });

  if (!m) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Equipo</h1>
        <p className="mt-0.5 text-[13px] text-zinc-500">
          Invita personas a colaborar en {agencyName ?? "tu agencia"}.
        </p>
        <div className="card mt-6 p-6 text-center text-[13px] text-zinc-500">
          No estás vinculado a ninguna agencia.
        </div>
      </div>
    );
  }

  const [canManageRoles, canInvite] = await Promise.all([
    hasPermission(user.id, m.agencyId, "roles.manage"),
    hasPermission(user.id, m.agencyId, "team.invite"),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Equipo</h1>
      <p className="mt-0.5 text-[13px] text-zinc-500">
        Personas que colaboran en {agencyName ?? "tu agencia"} y los roles que pueden tener.
      </p>
      <div className="mt-6">
        <TeamTabs canManageRoles={canManageRoles} canInvite={canInvite} />
      </div>
    </div>
  );
}
