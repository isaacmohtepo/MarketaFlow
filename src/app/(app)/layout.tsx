import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { getUserAgencyName } from "@/lib/agency";
import { prisma } from "@/lib/db";
import AppShell from "@/components/AppShell";
import ImpersonateBanner from "@/components/ImpersonateBanner";
import SuspendedBanner from "@/components/SuspendedBanner";
import AdminTwoFAReminder from "@/components/AdminTwoFAReminder";
import { getSystemSetting } from "@/lib/system-settings";

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

  const [agencyName, userRow, ownerMembership, anyMembership] = await Promise.all([
    getUserAgencyName(user.id),
    prisma.user.findUnique({
      where: { id: user.id },
      select: {
        avatarUrl: true,
        role: true,
        totpEnabledAt: true,
        createdAt: true,
      },
    }),
    prisma.membership.findFirst({
      where: { userId: user.id, role: "owner", brandId: null },
      select: { id: true },
    }),
    // Para detectar si la agency del user está suspended, traemos cualquier
    // membership con la agency. Si tiene varias agencies y alguna está
    // suspended, mostramos banner solo si la "primaria" (primera) lo está.
    prisma.membership.findFirst({
      where: { userId: user.id },
      include: {
        agency: {
          select: {
            id: true,
            name: true,
            suspendedAt: true,
            suspendedReason: true,
          },
        },
      },
      orderBy: { id: "asc" },
    }),
  ]);

  const isAdmin = userRow?.role === "admin";
  const isOwner = !!ownerMembership;
  const suspendedAgency =
    anyMembership?.agency.suspendedAt
      ? anyMembership.agency
      : null;

  // 2FA enforcement para admins: banner amarillo durante el grace period,
  // rojo cuando expira. El grace lo resuelve getSystemSetting (DB → env → default).
  let admin2fa: { daysLeft: number; expired: boolean } | null = null;
  if (isAdmin && userRow && !userRow.totpEnabledAt) {
    const graceDays = await getSystemSetting("admin2faGraceDays");
    const elapsed =
      (Date.now() - userRow.createdAt.getTime()) / (24 * 60 * 60 * 1000);
    const daysLeft = Math.max(0, Math.ceil(graceDays - elapsed));
    admin2fa = { daysLeft, expired: daysLeft === 0 };
  }

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
      {suspendedAgency && (
        <SuspendedBanner
          agencyName={suspendedAgency.name}
          reason={suspendedAgency.suspendedReason}
          isOwner={isOwner}
        />
      )}
      {admin2fa && (
        <AdminTwoFAReminder
          daysLeft={admin2fa.daysLeft}
          expired={admin2fa.expired}
        />
      )}
      {children}
    </AppShell>
  );
}
