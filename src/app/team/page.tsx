import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getUserAgencyName } from "@/lib/agency";
import { prisma } from "@/lib/db";
import AppShell from "@/components/AppShell";
import TeamManager from "./TeamManager";

export default async function TeamPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const agencyName = await getUserAgencyName(user.id);

  const owner = await prisma.membership.findFirst({
    where: { userId: user.id, role: "owner", brandId: null },
  });

  return (
    <AppShell userName={user.name ?? user.email} agencyName={agencyName} title="Equipo">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Equipo</h1>
        <p className="mt-0.5 text-[13px] text-zinc-500">
          Invita editores a colaborar en todas las marcas de tu agencia.
        </p>
        {!owner ? (
          <div className="card mt-6 p-6 text-center text-[13px] text-zinc-500">
            Solo el owner de la agencia puede gestionar el equipo.
          </div>
        ) : (
          <div className="mt-6">
            <TeamManager />
          </div>
        )}
      </div>
    </AppShell>
  );
}
