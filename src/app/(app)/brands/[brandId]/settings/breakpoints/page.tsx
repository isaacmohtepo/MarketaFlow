import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getBrandAccess } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { parseBreakpoints } from "@/lib/breakpoints";
import BreakpointsForm from "./BreakpointsForm";

/**
 * Settings → Breakpoints. Configurá los thresholds responsive (Mobile Portrait,
 * Tablet Portrait, Tablet Landscape, Laptop, Widescreen) que la app usa para
 * clasificar comentarios y mostrar presets de viewport en el web feedback.
 */
export default async function BrandSettingsBreakpoints({
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
    where: { id: brandId },
    select: { breakpoints: true },
  });
  if (!brand) notFound();

  const initial = parseBreakpoints(brand.breakpoints);

  return (
    <section className="card p-6">
      <h2 className="text-sm font-semibold text-zinc-900">Breakpoints responsive</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Definí cuándo un viewport cuenta como mobile, tablet, laptop o
        widescreen. La app usa estos valores para filtrar comentarios por
        dispositivo y mostrar los presets correctos en el preview del widget.
      </p>
      <div className="mt-5">
        <BreakpointsForm brandId={brandId} initial={initial} />
      </div>
    </section>
  );
}
