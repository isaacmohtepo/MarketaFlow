import Link from "next/link";
import { redirect } from "next/navigation";
import { Sparkles, ChevronRight } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { listUserBrands } from "@/lib/permissions";
import { prisma } from "@/lib/db";

/**
 * Vista global de plantillas. Muestra TODAS las plantillas de TODAS las
 * marcas accesibles por el user. Click → settings/library de la marca
 * para editar/borrar.
 */
export default async function GlobalTemplatesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const brands = await listUserBrands(user.id);
  const brandIds = brands.map((b) => b.id);

  if (brandIds.length === 0) {
    return (
      <div className="mx-auto max-w-3xl py-10 text-center">
        <Sparkles className="mx-auto h-10 w-10 text-zinc-300" />
        <p className="mt-3 text-[14px] font-semibold text-zinc-900">
          Sin marcas todavía
        </p>
        <p className="mt-1 text-[12px] text-zinc-500">
          Creá una marca primero para guardar plantillas.
        </p>
      </div>
    );
  }

  const templates = await prisma.postTemplate.findMany({
    where: { brandId: { in: brandIds } },
    include: { brand: { select: { id: true, name: true, color: true } } },
    orderBy: { updatedAt: "desc" },
  });

  // Agrupar por brand
  const byBrand = new Map<string, typeof templates>();
  for (const t of templates) {
    if (!byBrand.has(t.brandId)) byBrand.set(t.brandId, []);
    byBrand.get(t.brandId)!.push(t);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">Plantillas</h1>
          <p className="mt-0.5 text-[12px] text-zinc-500">
            Captions y formatos guardados que reutilizás al crear posts.
            {templates.length > 0 && (
              <>
                {" · "}
                <strong>{templates.length}</strong>{" "}
                {templates.length === 1 ? "plantilla" : "plantillas"} en{" "}
                <strong>{byBrand.size}</strong>{" "}
                {byBrand.size === 1 ? "marca" : "marcas"}
              </>
            )}
          </p>
        </div>
      </div>

      {templates.length === 0 ? (
        <div className="card p-10 text-center">
          <Sparkles className="mx-auto h-10 w-10 text-zinc-300" />
          <p className="mt-3 text-[14px] font-semibold text-zinc-900">
            Aún no tenés plantillas
          </p>
          <p className="mt-1 text-[12px] text-zinc-500">
            Andá a la sección Biblioteca de cualquier marca para crearlas.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            {brands.slice(0, 3).map((b) => (
              <Link
                key={b.id}
                href={`/brands/${b.id}/settings/library`}
                className="btn-secondary inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-[12px] font-semibold"
              >
                {b.name}
                <ChevronRight className="h-3 w-3" />
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {Array.from(byBrand.entries()).map(([brandId, items]) => {
            const brand = items[0].brand;
            return (
              <section key={brandId} className="card overflow-hidden">
                <div className="flex items-center justify-between gap-3 border-b border-zinc-100 bg-zinc-50/40 px-5 py-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 flex-shrink-0 rounded-full"
                      style={{ background: brand.color ?? "#8a2be2" }}
                    />
                    <h2 className="text-[13px] font-bold text-zinc-900">
                      {brand.name}
                    </h2>
                    <span className="text-[10.5px] text-zinc-500">
                      ({items.length}{" "}
                      {items.length === 1 ? "plantilla" : "plantillas"})
                    </span>
                  </div>
                  <Link
                    href={`/brands/${brandId}/settings/library`}
                    className="text-[11.5px] font-semibold text-zinc-600 hover:text-zinc-900"
                  >
                    Gestionar →
                  </Link>
                </div>
                <ul className="divide-y divide-zinc-100">
                  {items.map((t) => (
                    <li key={t.id} className="px-5 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-semibold text-zinc-900">
                            {t.name}
                          </p>
                          <p className="mt-0.5 text-[11.5px] text-zinc-500 whitespace-pre-line line-clamp-3">
                            {t.caption || (
                              <span className="italic text-zinc-400">
                                (sin caption por defecto)
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="flex flex-shrink-0 items-center gap-2">
                          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-zinc-600">
                            {t.platform}
                          </span>
                          <Link
                            href={`/brands/${brandId}/posts/new?template=${t.id}`}
                            className="btn-gradient inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11.5px] font-semibold"
                          >
                            Usar
                            <ChevronRight className="h-3 w-3" />
                          </Link>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
