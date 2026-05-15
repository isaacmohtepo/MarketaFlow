import { redirect, notFound } from "next/navigation";
import { AtSign as Instagram, Sparkles } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getBrandAccess } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { isMetaOAuthConfigured } from "@/lib/feature-flags";
import InstagramConnector from "./InstagramConnector";

export default async function BrandInstagramSettings({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { brandId } = await params;
  const access = await getBrandAccess(user.id, brandId);
  if (!access || !access.canEdit) notFound();

  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: {
      name: true,
      igUserId: true,
      igAccessToken: true,
      igAccessTokenEnc: true,
    },
  });
  if (!brand) notFound();
  const hasToken = !!(brand.igAccessToken || brand.igAccessTokenEnc);

  // Si la plataforma todavía no tiene OAuth de Meta configurado,
  // mostramos un placeholder "Próximamente" en vez del connector roto.
  // Eso pasa cuando el operador del SaaS no ha completado el App Review
  // de Meta. Mientras tanto, los users planean y aprueban en MarketaFlow
  // y publican manual en IG nativo.
  const metaEnabled = isMetaOAuthConfigured();

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Instagram className="h-5 w-5 text-fuchsia-600" />
        <h1 className="text-xl font-bold tracking-tight text-zinc-900">
          Conectar Instagram
        </h1>
      </div>
      {metaEnabled ? (
        <>
          <p className="text-[12.5px] text-zinc-500">
            Una vez conectada la cuenta, los posts aprobados con fecha
            programada se publican automáticamente en Instagram cuando llega
            el momento.
          </p>
          <InstagramConnector
            brandId={brandId}
            connected={!!brand.igUserId && hasToken}
            currentIgUserId={brand.igUserId}
          />
        </>
      ) : (
        <div className="card relative overflow-hidden p-7">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-gradient-to-br from-fuchsia-300 to-rose-300 opacity-20 blur-2xl"
          />
          <div className="relative">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-fuchsia-50 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wider text-fuchsia-700 ring-1 ring-fuchsia-200">
              <Sparkles className="h-3 w-3" />
              Próximamente
            </span>
            <h2 className="mt-3 text-[15px] font-semibold tracking-tight text-zinc-900">
              Auto-publicación a Instagram
            </h2>
            <p className="mt-1 max-w-xl text-[13px] text-zinc-600">
              Estamos terminando la integración con Meta. Mientras tanto,
              podés planear y aprobar todo el contenido en MarketaFlow, y al
              final del flujo copiar el caption y subir la pieza directo
              desde Instagram.
            </p>
            <p className="mt-3 text-[11.5px] text-zinc-500">
              Cuando esté lista, tu cliente solo va a tener que conectar su
              cuenta una vez con un click — sin pegar tokens ni configuración.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
