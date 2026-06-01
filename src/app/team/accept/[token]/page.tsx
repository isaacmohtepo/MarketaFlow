import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canInviteTeamMember } from "@/lib/billing";
import AcceptForm from "./AcceptForm";

export default async function AcceptInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const inv = await prisma.teamInvitation.findUnique({
    where: { token },
    include: { agency: true },
  });
  if (!inv) notFound();

  const expired = inv.expiresAt < new Date() || inv.acceptedAt;
  const user = await getCurrentUser();

  // Si ya tiene cuenta y email match → unir directamente
  if (!expired && user && user.email.toLowerCase() === inv.email.toLowerCase()) {
    const existingM = await prisma.membership.findFirst({
      where: { userId: user.id, agencyId: inv.agencyId, brandId: null },
    });
    if (!existingM) {
      // Re-check plan limit: la agency pudo haber downgradeado entre la
      // invitación y el accept. Si ya no hay cupo, mostramos error en vez
      // de crear silenciosamente un membership que excede el plan.
      const check = await canInviteTeamMember(inv.agencyId);
      if (!check.ok) {
        return (
          <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-6">
            <div className="card max-w-md p-7 text-center">
              <p className="text-base font-semibold text-zinc-900">
                La agencia ya no tiene espacio en su plan
              </p>
              <p className="mt-2 text-[13px] text-zinc-500">
                {inv.agency.name} llegó al límite de miembros. Contacta al
                owner para que upgradee o libere un espacio.
              </p>
            </div>
          </div>
        );
      }
      await prisma.membership.create({
        data: {
          userId: user.id,
          agencyId: inv.agencyId,
          role: inv.role,
        },
      });
    }
    await prisma.teamInvitation.update({
      where: { id: inv.id },
      data: { acceptedAt: new Date() },
    });
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm card p-7">
          {expired ? (
            <>
              <h1 className="text-xl font-bold text-zinc-900">Invitación inválida</h1>
              <p className="mt-2 text-[13px] text-zinc-500">
                Este link expiró o ya fue usado. Pídele al owner que te envíe uno nuevo.
              </p>
            </>
          ) : (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Te invitan a unirte a
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900">
                {inv.agency.name}
              </h1>
              <p className="mt-1 text-[13px] text-zinc-500">
                Como <span className="font-semibold text-zinc-900">{inv.role}</span> ·{" "}
                {inv.email}
              </p>
              <div className="mt-6">
                <AcceptForm token={token} email={inv.email} hasUser={!!user} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
