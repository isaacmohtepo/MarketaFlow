import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getBrandAccess, hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import BrandCustomization from "./BrandCustomization";
import DuplicateBrandButton from "./DuplicateBrandButton";
import DeleteBrandButton from "./DeleteBrandButton";

/**
 * Settings → General. Personalización de la marca (logo, color, bio) +
 * lista de clientes con acceso. Otras secciones (compartir, widget, biblioteca,
 * audit) viven en sub-rutas — ver `SettingsNav.tsx`.
 */
export default async function BrandSettingsGeneral({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const access = await getBrandAccess(user.id, brandId);
  if (!access || !access.canEdit) notFound();
  const [brand, clients] = await Promise.all([
    prisma.brand.findUnique({ where: { id: access.brandId } }),
    prisma.membership.findMany({
      where: { brandId: access.brandId, role: "client" },
      include: { user: { select: { id: true, name: true, email: true, createdAt: true } } },
    }),
  ]);
  if (!brand) notFound();

  const canDelete = await hasPermission(
    user.id,
    access.agencyId,
    "brands.delete",
    access.brandId,
  );

  return (
    <>
      <section className="card p-6">
        <h2 className="text-sm font-semibold text-zinc-900">Personalización</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Logo, color y bio se usan en el dashboard, emails y la vista IG.
        </p>
        <div className="mt-4">
          <BrandCustomization
            brandId={brandId}
            initial={{
              name: brand.name,
              handle: brand.handle,
              logoUrl: brand.logoUrl,
              color: brand.color,
              bio: brand.bio,
            }}
          />
        </div>
      </section>

      <section className="card p-6">
        <h2 className="text-sm font-semibold text-zinc-900">Duplicar marca</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Crea una nueva marca con el mismo color, bio, logo, hashtags y plantillas.
          Útil para onboardear clientes nuevos con setup similar — los posts, comentarios y miembros no se copian.
        </p>
        <div className="mt-3">
          <DuplicateBrandButton brandId={brandId} brandName={brand.name} />
        </div>
      </section>

      <section className="card p-6">
        <h2 className="text-sm font-semibold text-zinc-900">Clientes con acceso</h2>
        <ul className="mt-3 divide-y divide-zinc-100/80">
          {clients.length === 0 && (
            <li className="py-3 text-sm text-zinc-500">
              Aún no hay clientes invitados.
            </li>
          )}
          {clients.map((m) => (
            <li key={m.id} className="flex items-center justify-between py-3 text-sm">
              <span className="text-zinc-800">{m.user.name ?? m.user.email}</span>
              <span className="text-zinc-500">{m.user.email}</span>
            </li>
          ))}
        </ul>
      </section>

      {canDelete && (
        <section className="card border-rose-200 bg-rose-50/30 p-6 ring-1 ring-rose-200/40">
          <h2 className="text-sm font-semibold text-rose-900">Zona peligrosa</h2>
          <p className="mt-1 text-xs text-rose-700/80">
            Borra la marca de forma permanente. Se eliminan todos los posts,
            comentarios, plantillas e historial. No se puede deshacer.
          </p>
          <div className="mt-3">
            <DeleteBrandButton brandId={brandId} brandName={brand.name} />
          </div>
        </section>
      )}
    </>
  );
}
