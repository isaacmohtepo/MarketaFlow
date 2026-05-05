import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getBrandAccess } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import BrandCustomization from "./BrandCustomization";

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
    prisma.brand.findUnique({ where: { id: brandId } }),
    prisma.membership.findMany({
      where: { brandId, role: "client" },
      include: { user: true },
    }),
  ]);
  if (!brand) notFound();

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
    </>
  );
}
