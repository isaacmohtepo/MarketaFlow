import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getBrandAccess } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import SettingsNav from "./SettingsNav";

/**
 * Layout de Settings. Persiste header + nav lateral entre sub-rutas; solo el
 * contenido de la sección activa se re-renderiza al navegar.
 */
export default async function SettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const access = await getBrandAccess(user.id, brandId);
  if (!access || !access.canEdit) notFound();
  const brand = await prisma.brand.findUnique({
    where: { id: access.brandId },
    select: { name: true },
  });
  if (!brand) notFound();

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href={`/brands/${brandId}`}
        className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-900"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Volver al feed
      </Link>
      <h1 className="mt-3 text-2xl font-bold text-zinc-900">{brand.name}</h1>
      <p className="text-sm text-zinc-500">Ajustes de la marca</p>

      <div className="mt-6 grid gap-6 sm:grid-cols-[220px_1fr]">
        <aside>
          <SettingsNav brandId={brandId} />
        </aside>
        <div className="min-w-0 space-y-6">{children}</div>
      </div>
    </div>
  );
}
