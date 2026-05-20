import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { getUserAgencyName } from "@/lib/agency";
import { prisma } from "@/lib/db";
import AppShell from "@/components/AppShell";
import ImpersonateBanner from "@/components/ImpersonateBanner";
import SuspendedBanner from "@/components/SuspendedBanner";
import AdminTwoFAReminder from "@/components/AdminTwoFAReminder";
import PastDueGraceBanner from "@/components/PastDueGraceBanner";
import { getSystemSetting } from "@/lib/system-settings";
import { getBillingSummary } from "@/lib/billing";
import { PLANS, type PlanId } from "@/lib/plans";
import { permissionsForRole } from "@/lib/permissions";
import { PermissionsProvider } from "@/components/PermissionsProvider";
import { getFeatureFlags } from "@/lib/feature-flags";
import { FeatureFlagsProvider } from "@/components/FeatureFlagsProvider";
import { getWhiteLabel, whiteLabelCssOverride } from "@/lib/white-label";

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
      select: { id: true, agencyId: true },
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

  // Computar permisos del user en su agency (agency-wide + brand-scoped).
  // Sirven para que la UI esconda lo que el user no puede hacer. Se computa
  // una sola vez por request y se pasa al cliente vía PermissionsProvider.
  const agencyId = anyMembership?.agencyId;
  const agencyPerms = new Set<string>();
  const brandPerms: Record<string, string[]> = {};
  const userRoles = new Set<string>();
  if (agencyId) {
    const memberships = await prisma.membership.findMany({
      where: { userId: user.id, agencyId },
      select: { role: true, brandId: true },
    });
    for (const m of memberships) {
      userRoles.add(m.role);
      const perms = await permissionsForRole(agencyId, m.role);
      if (m.brandId === null) {
        perms.forEach((p) => agencyPerms.add(p));
      } else {
        const arr = brandPerms[m.brandId] ?? [];
        for (const p of perms) if (!arr.includes(p)) arr.push(p);
        brandPerms[m.brandId] = arr;
      }
    }
  }

  // Billing summary para mostrar plan real en el sidebar (solo owners ven
  // este card — clients/editors no tienen acceso a billing).
  let planCard: {
    planId: PlanId;
    planName: string;
    status: string;
    cancelAtPeriodEnd: boolean;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
    nextChargeAt: string | null;
    priceMonthlyCents: number;
    billingCycle: string;
  } | null = null;
  // Banner de gracia: cuando el plan venció (past_due) mostramos aviso
  // diario con días restantes hasta bajar a Free.
  let pastDueGrace: { planName: string; daysLeft: number } | null = null;
  if (isOwner && ownerMembership) {
    try {
      const summary = await getBillingSummary(ownerMembership.agencyId);
      const plan = PLANS[summary.planId];
      planCard = {
        planId: summary.planId,
        planName: plan.name,
        status: summary.status,
        cancelAtPeriodEnd: summary.cancelAtPeriodEnd,
        trialEndsAt: summary.trialEndsAt?.toISOString() ?? null,
        currentPeriodEnd: summary.currentPeriodEnd?.toISOString() ?? null,
        nextChargeAt: summary.nextChargeAt?.toISOString() ?? null,
        priceMonthlyCents:
          summary.billingCycle === "yearly"
            ? Math.round(plan.priceCopYearly / 12)
            : plan.priceCopMonthly,
        billingCycle: summary.billingCycle,
      };

      if (summary.status === "past_due" && summary.pastDueSinceAt) {
        const graceDays = await getSystemSetting("gracePeriodDays").catch(
          () => 5,
        );
        const elapsed =
          (Date.now() - summary.pastDueSinceAt.getTime()) /
          (24 * 60 * 60 * 1000);
        const daysLeft = Math.max(0, Math.ceil(graceDays - elapsed));
        // El plan efectivo durante gracia es el pago (no free); usamos el
        // nombre del plan real de la sub, no el effective.
        pastDueGrace = { planName: plan.name, daysLeft };
      }
    } catch {
      // Si falla, dejamos planCard en null y el sidebar muestra el genérico
    }
  }

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

  const featureFlags = getFeatureFlags();

  // Resolver white-label de la agency primaria del user. Si está
  // activo, inyectamos las variables CSS y pasamos el logo/brandName
  // al AppShell. Cuando no hay white-label, usamos branding default.
  const primaryAgencyId =
    ownerMembership?.agencyId ?? anyMembership?.agencyId ?? null;
  const wl = primaryAgencyId
    ? await getWhiteLabel(primaryAgencyId)
    : null;
  const wlCss = wl ? whiteLabelCssOverride(wl) : "";

  return (
    <FeatureFlagsProvider flags={featureFlags}>
    <PermissionsProvider
      agencyPermissions={[...agencyPerms]}
      brandPermissions={brandPerms}
      roles={[...userRoles]}
    >
    {wlCss && (
      // Inyectar las variables CSS de white-label antes del shell para
      // que todos los componentes que usen brand-gradient las tomen.
      // eslint-disable-next-line react/no-danger
      <style dangerouslySetInnerHTML={{ __html: wlCss }} />
    )}
    <AppShell
      userName={user.name ?? user.email}
      userEmail={user.email}
      avatarUrl={userRow?.avatarUrl ?? null}
      agencyName={agencyName}
      brandName={wl?.enabled ? wl.brandName : null}
      brandLogoUrl={wl?.enabled ? wl.logoUrl : null}
      brandLogoMode={wl?.enabled ? wl.logoMode : null}
      brandLogoHeight={wl?.enabled ? wl.logoHeight : null}
      brandHeaderAlign={wl?.enabled ? wl.headerAlign : null}
      isAdmin={isAdmin}
      isOwner={isOwner}
      planCard={planCard}
      banners={
        <>
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
          {pastDueGrace && (
            <PastDueGraceBanner
              planName={pastDueGrace.planName}
              daysLeft={pastDueGrace.daysLeft}
            />
          )}
        </>
      }
    >
      {children}
    </AppShell>
    </PermissionsProvider>
    </FeatureFlagsProvider>
  );
}
