import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getBrandAccess } from "@/lib/permissions";
import { getUserAgencyName } from "@/lib/agency";
import { prisma } from "@/lib/db";
import AppShell from "@/components/AppShell";
import InviteLink from "./InviteLink";
import PublicShareToggle from "./PublicShareToggle";
import HashtagSetsManager from "./HashtagSetsManager";
import BrandCustomization from "./BrandCustomization";

export default async function BrandSettings({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const access = await getBrandAccess(user.id, brandId);
  if (!access || !access.canEdit) notFound();
  const [brand, agencyName, clients] = await Promise.all([
    prisma.brand.findUnique({ where: { id: brandId } }),
    getUserAgencyName(user.id),
    prisma.membership.findMany({
      where: { brandId, role: "client" },
      include: { user: true },
    }),
  ]);
  if (!brand) notFound();

  return (
    <AppShell
      userName={user.name ?? user.email}
      agencyName={agencyName}
      title={`${brand.name} · Ajustes`}
    >
      <div className="mx-auto max-w-3xl">
        <Link
          href={`/brands/${brandId}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-900"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Volver al feed
        </Link>
        <h1 className="mt-3 text-2xl font-bold text-zinc-900">{brand.name}</h1>
        <p className="text-sm text-zinc-500">Ajustes de la marca</p>

        <section className="card mt-6 p-6">
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

        <section className="card mt-6 p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">Link público</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Tu cliente abre el link, escribe su nombre y aprueba al instante.
                <span className="ml-1 font-medium text-fuchsia-700">Sin registro.</span>
              </p>
            </div>
            <span className="flex-shrink-0 rounded-full bg-fuchsia-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-fuchsia-700">
              Recomendado
            </span>
          </div>
          <div className="mt-4">
            <PublicShareToggle
              brandId={brandId}
              initialToken={brand.publicToken}
            />
          </div>
        </section>

        <section className="card mt-6 p-6">
          <h2 className="text-sm font-semibold text-zinc-900">
            Link de invitación con cuenta
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            El cliente crea una cuenta con email y contraseña. Útil si quieres que tenga
            acceso permanente desde múltiples dispositivos.
          </p>
          <div className="mt-4">
            <InviteLink code={brand.inviteCode} />
          </div>
        </section>

        <section className="card mt-6 p-6">
          <h2 className="text-sm font-semibold text-zinc-900">Biblioteca de hashtags</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Crea sets reutilizables (ej: <span className="font-mono">#promo</span>,{" "}
            <span className="font-mono">#fitness</span>). Al escribir un post, los pegas con un click.
          </p>
          <div className="mt-4">
            <HashtagSetsManager brandId={brandId} />
          </div>
        </section>

        <section className="card mt-6 p-6">
          <h2 className="text-sm font-semibold text-zinc-900">Clientes con acceso</h2>
          <ul className="mt-3 divide-y divider">
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
      </div>
    </AppShell>
  );
}
