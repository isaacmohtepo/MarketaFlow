import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
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
    const existing = await prisma.membership.findFirst({
      where: { userId: user.id, brandId: brand.id },
    });
    if (!existing) {
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
    <div className="flex min-h-screen flex-col bg-black">
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
