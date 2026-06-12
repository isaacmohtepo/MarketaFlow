import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getBrandAccess } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import WidgetInstall from "../WidgetInstall";

/**
 * Settings → Widget. Instalación del widget de feedback estilo Marker.io.
 */
export default async function BrandSettingsWidget({
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
    select: { widgetToken: true },
  });
  if (!brand) notFound();

  return (
    <section className="card p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">
            Widget de feedback en el sitio
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            Estilo Marker.io — el cliente comenta directamente sobre el sitio web del
            staging y tú recibes capturas pixel-perfect en este tablero.
          </p>
        </div>
        <span className="flex-shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-3xs font-bold uppercase tracking-wider text-violet-700">
          Web feedback
        </span>
      </div>
      <div className="mt-4">
        <WidgetInstall brandId={brandId} initialToken={brand.widgetToken} />
      </div>
    </section>
  );
}
