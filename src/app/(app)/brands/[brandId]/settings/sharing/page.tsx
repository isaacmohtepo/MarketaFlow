import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getBrandAccess } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import PublicShareToggle from "../PublicShareToggle";
import InviteLink from "../InviteLink";

/**
 * Settings → Compartir. Link público (sin registro) e invitación con cuenta.
 */
export default async function BrandSettingsSharing({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const access = await getBrandAccess(user.id, brandId);
  if (!access || !access.canEdit) notFound();
  const brand = await prisma.brand.findUnique({
    where: { id: access.brandId },
    select: { publicToken: true, inviteCode: true },
  });
  if (!brand) notFound();

  return (
    <>
      <section className="card p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Link público</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Tu cliente abre el link, escribe su nombre y aprueba al instante.
              <span className="ml-1 font-medium text-fuchsia-700">Sin registro.</span>
            </p>
          </div>
          <span className="flex-shrink-0 rounded-full bg-fuchsia-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-fuchsia-700">
            Recomendado
          </span>
        </div>
        <div className="mt-4">
          <PublicShareToggle brandId={brandId} initialToken={brand.publicToken} />
        </div>
      </section>

      <section className="card p-6">
        <h2 className="text-sm font-semibold text-zinc-900">
          Link de invitación con cuenta
        </h2>
        <p className="mt-1 text-xs text-zinc-500">
          El cliente crea una cuenta con email y contraseña. Útil si quieres que tenga
          acceso permanente desde múltiples dispositivos.
        </p>
        <div className="mt-4">
          <InviteLink code={brand.inviteCode} />
        </div>
      </section>
    </>
  );
}
