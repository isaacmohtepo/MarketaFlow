import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { getUserAgencyName } from "@/lib/agency";
import { prisma } from "@/lib/db";
import AppShell from "@/components/AppShell";
import ImpersonateBanner from "@/components/ImpersonateBanner";

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

  // Detectar si la sesión actual es un impersonate. Si hay cookie
  // mf_impersonator, mostramos un banner sticky con info del admin original
  // y un botón para volver.
  const jar = await cookies();
  const impersonatorToken = jar.get("mf_impersonator")?.value;
  let impersonator: { email: string } | null = null;
  if (impersonatorToken) {
    const adminSession = await prisma.session.findUnique({
      where: { token: impersonatorToken },
      include: { user: { select: { email: true } } },
    });
    if (adminSession && adminSession.expiresAt > new Date()) {
      impersonator = { email: adminSession.user.email };
    }
  }

  return (
    <AppShell
      userName={user.name ?? user.email}
      avatarUrl={userRow?.avatarUrl ?? null}
      agencyName={agencyName}
      isAdmin={isAdmin}
      isOwner={isOwner}
    >
      {impersonator && (
        <ImpersonateBanner
          adminEmail={impersonator.email}
          targetEmail={user.email}
        />
      )}
      {children}
    </AppShell>
  );
}
