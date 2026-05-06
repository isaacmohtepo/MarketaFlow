import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import OnboardingWizard from "./OnboardingWizard";

/**
 * Onboarding wizard post-signup. 4 pasos:
 *   1. Bienvenida (no input, solo "comenzar")
 *   2. Crear primera marca
 *   3. Invitar al primer cliente (skip ok)
 *   4. Listo (link al dashboard)
 *
 * Skip global del wizard también seteamos `onboardingCompletedAt`.
 *
 * Acceso: solo users autenticados. Si ya completó (o tiene marcas), redirige
 * al dashboard — para que no vea el wizard dos veces.
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ force?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const force = sp.force === "1";

  const [full, brandsCount, agencyMembership] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: { onboardingCompletedAt: true, name: true, email: true },
    }),
    prisma.membership.count({
      where: { userId: user.id, role: { in: ["owner", "editor"] } },
    }),
    prisma.membership.findFirst({
      where: { userId: user.id, role: "owner", brandId: null },
      include: { agency: { select: { id: true, name: true } } },
    }),
  ]);

  // Si ya completó y no se forzó, redirigimos al dashboard.
  if (!force && full?.onboardingCompletedAt) {
    redirect("/dashboard");
  }

  // No es agency owner — no tiene sentido el wizard de "crear marca"
  if (!agencyMembership) {
    redirect("/dashboard");
  }

  return (
    <div
      className="min-h-screen w-full"
      style={{ background: "var(--bg-app)" }}
    >
      <OnboardingWizard
        userName={full?.name ?? user.email.split("@")[0]}
        agencyId={agencyMembership.agencyId}
        agencyName={agencyMembership.agency.name}
        existingBrandsCount={brandsCount}
      />
    </div>
  );
}
