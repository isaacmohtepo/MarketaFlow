import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canInviteClient } from "@/lib/billing";
import { getWhiteLabel } from "@/lib/white-label";
import GuestForm from "./GuestForm";

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const brand = await prisma.brand.findUnique({
    where: { publicToken: token },
    include: { agency: true },
  });
  if (!brand) notFound();

  const user = await getCurrentUser();
  if (user) {
    // Ya tiene membership a esta brand (cualquier rol) → pasa derecho
    const existingBrandMember = await prisma.membership.findFirst({
      where: { userId: user.id, brandId: brand.id },
    });
    if (existingBrandMember) {
      redirect(`/brands/${brand.slug ?? brand.id}`);
    }
    // ¿Es miembro AGENCY-level de la misma agencia? → ya tiene acceso por
    // default (owner/editor). No creamos client membership extra.
    const agencyMember = await prisma.membership.findFirst({
      where: { userId: user.id, agencyId: brand.agencyId, brandId: null },
    });
    if (agencyMember) {
      redirect(`/brands/${brand.slug ?? brand.id}`);
    }
    // Crear membership client — sujeto a plan limit (igual que vía API).
    const check = await canInviteClient(brand.id);
    if (!check.ok) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-6">
          <div className="card max-w-md p-7 text-center">
            <p className="text-base font-semibold text-zinc-900">
              No podemos darte acceso ahora
            </p>
            <p className="mt-2 text-[13px] text-zinc-500">
              Esta marca alcanzó el límite de clientes en su plan actual.
              Contacta a la agencia para que te invite directamente.
            </p>
          </div>
        </div>
      );
    }
    await prisma.membership.create({
      data: {
        userId: user.id,
        agencyId: brand.agencyId,
        brandId: brand.id,
        role: "client",
      },
    });
    redirect(`/brands/${brand.slug ?? brand.id}`);
  }

  const wl = await getWhiteLabel(brand.agencyId);
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm card p-7">
          {/* Header con branding (logo + nombre) */}
          {wl.enabled && wl.logoUrl ? (
            <div className="mb-5 flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={wl.logoUrl}
                alt={wl.brandName}
                className="h-7 w-7 rounded object-contain"
              />
              <span className="text-[13px] font-bold text-zinc-900">
                {wl.brandName}
              </span>
            </div>
          ) : null}

          <p className="text-2xs font-semibold uppercase tracking-wider text-zinc-500">
            Te invitan a revisar
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900">
            {brand.name}
          </h1>
          <p className="text-sm text-zinc-500">por {brand.agency.name}</p>

          <div className="mt-6 rounded-lg bg-gradient-to-br from-blue-50 via-fuchsia-50 to-rose-50 p-3 text-[12px] text-zinc-700">
            👋 Sin registro. Solo dinos cómo te llamas y empieza a aprobar contenido.
          </div>

          <div className="mt-5">
            <GuestForm token={token} />
          </div>

          {/* Footer: si white-label activo, "Powered by <brand>".
              Si no, footer default de MarketaFlow. */}
          <p className="mt-6 text-center text-3xs text-zinc-400">
            {wl.enabled
              ? `Hecho con ${wl.brandName}`
              : "Hecho con MarketaFlow"}
          </p>
        </div>
      </div>
    </div>
  );
}
