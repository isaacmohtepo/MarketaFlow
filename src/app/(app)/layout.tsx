import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getUserAgencyName } from "@/lib/agency";
import { prisma } from "@/lib/db";
import AppShell from "@/components/AppShell";

/**
 * Layout compartido para todas las rutas autenticadas (dashboard, brands, inbox,
 * team, account). El AppShell vive aquí, así que el sidebar y topbar persisten
 * entre navegaciones — solo el contenido del page se re-renderiza.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [agencyName, userRow, ownerMembership] = await Promise.all([
    getUserAgencyName(user.id),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { avatarUrl: true, role: true },
    }),
    // Es owner si tiene al menos una membership de role=owner agency-level
    prisma.membership.findFirst({
      where: { userId: user.id, role: "owner", brandId: null },
      select: { id: true },
    }),
  ]);

  const isAdmin = userRow?.role === "admin";
  const isOwner = !!ownerMembership;

  return (
    <AppShell
      userName={user.name ?? user.email}
      avatarUrl={userRow?.avatarUrl ?? null}
      agencyName={agencyName}
      isAdmin={isAdmin}
      isOwner={isOwner}
    >
      {children}
    </AppShell>
  );
}
