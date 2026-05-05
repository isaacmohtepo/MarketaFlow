import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getBrandAccess } from "@/lib/permissions";
import HashtagSetsManager from "../HashtagSetsManager";
import TemplatesManager from "../TemplatesManager";

/**
 * Settings → Biblioteca. Sets de hashtags y plantillas de post.
 */
export default async function BrandSettingsLibrary({
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
    <>
      <section className="card p-6">
        <h2 className="text-sm font-semibold text-zinc-900">Biblioteca de hashtags</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Crea sets reutilizables (ej: <span className="font-mono">#promo</span>,{" "}
          <span className="font-mono">#fitness</span>). Al escribir un post, los pegas
          con un click.
        </p>
        <div className="mt-4">
          <HashtagSetsManager brandId={brandId} />
        </div>
      </section>

      <section className="card p-6">
        <h2 className="text-sm font-semibold text-zinc-900">Plantillas de post</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Guarda estructuras repetidas (caption + plataforma) para reusar al crear
          posts. Ideal para "el post de los lunes".
        </p>
        <div className="mt-4">
          <TemplatesManager brandId={brandId} />
        </div>
      </section>
    </>
  );
}
