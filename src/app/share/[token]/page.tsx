import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
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
    // Si ya está logueado, asegurarnos de que tenga acceso a la marca
    const membership = await prisma.membership.findFirst({
      where: { userId: user.id, brandId: brand.id },
    });
    if (!membership) {
      await prisma.membership.create({
        data: {
          userId: user.id,
          agencyId: brand.agencyId,
          brandId: brand.id,
          role: "client",
        },
      });
    }
    redirect(`/brands/${brand.id}`);
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm card p-7">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
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
        </div>
      </div>
    </div>
  );
}
