import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canInviteClient } from "@/lib/billing";
import PublicHeader from "@/components/PublicHeader";
import InviteForm from "./InviteForm";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const brand = await prisma.brand.findUnique({
    where: { inviteCode: code },
    include: { agency: true },
  });
  if (!brand) notFound();

  const user = await getCurrentUser();
  if (user) {
    // Ya tiene acceso a esta brand (cualquier rol)
    const existing = await prisma.membership.findFirst({
      where: { userId: user.id, brandId: brand.id },
    });
    if (existing) {
      redirect(`/brands/${brand.id}`);
    }
    // Es miembro de la agency (owner/editor) → ya tiene acceso, no sumamos
    const agencyMember = await prisma.membership.findFirst({
      where: { userId: user.id, agencyId: brand.agencyId, brandId: null },
    });
    if (agencyMember) {
      redirect(`/brands/${brand.id}`);
    }
    // Crear como client respetando plan limits
    const check = await canInviteClient(brand.id);
    if (!check.ok) {
      return (
        <div className="theme-dark flex min-h-screen items-center justify-center bg-black p-6">
          <div className="card max-w-md p-7 text-center">
            <p className="text-base font-semibold text-white">
              No podemos darte acceso ahora
            </p>
            <p className="mt-2 text-[13px] text-zinc-400">
              Esta marca alcanzó el límite de clientes. Contacta a la agencia.
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

  return (
    <div className="theme-dark flex min-h-screen flex-col bg-black">
      <PublicHeader />
      <div className="relative flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm card p-8">
          <p className="text-xs uppercase tracking-wider text-zinc-500">
            Te invitan a revisar
          </p>
          <h1 className="mt-1 text-2xl font-bold text-white">{brand.name}</h1>
          <p className="text-sm text-zinc-500">por {brand.agency.name}</p>
          <div className="mt-6">
            <InviteForm code={code} brandName={brand.name} />
          </div>
        </div>
      </div>
    </div>
  );
}
