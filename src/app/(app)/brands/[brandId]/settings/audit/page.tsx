import { notFound, redirect } from "next/navigation";
import { Download } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getBrandAccess } from "@/lib/permissions";

/**
 * Settings → Audit log. Descarga de toda la actividad de la marca de los
 * últimos 90 días en CSV.
 */
export default async function BrandSettingsAudit({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const access = await getBrandAccess(user.id, brandId);
  if (!access || !access.canEdit) notFound();

  return (
    <section className="card p-6">
      <h2 className="text-sm font-semibold text-zinc-900">Audit log</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Descarga toda la actividad de la marca (cambios de estado, aprobaciones,
        comentarios, publicaciones) de los últimos 90 días en CSV.
      </p>
      <a
        href={`/api/brands/${brandId}/audit`}
        className="mt-3 inline-flex items-center gap-2 rounded-md btn-secondary px-3 py-2 text-[12px] font-semibold"
      >
        <Download className="h-3.5 w-3.5" />
        Descargar CSV
      </a>
    </section>
  );
}
