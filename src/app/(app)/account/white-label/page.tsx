import Link from "next/link";
import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getEffectiveLimits } from "@/lib/billing";
import WhiteLabelEditor from "./WhiteLabelEditor";

/**
 * /account/white-label
 *
 * Configura el branding que reemplaza "MarketaFlow" en páginas públicas
 * y emails que ven tus clientes. Solo accesible si el plan o el add-on
 * de white-label está activo. Si no, mostramos un CTA para comprarlo.
 */
export default async function WhiteLabelPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const m = await prisma.membership.findFirst({
    where: { userId: user.id, brandId: null },
    select: { agencyId: true },
  });
  if (!m) redirect("/dashboard");

  const [agency, limits] = await Promise.all([
    prisma.agency.findUnique({
      where: { id: m.agencyId },
      select: {
        name: true,
        wlBrandName: true,
        wlLogoUrl: true,
        wlAccentColor: true,
        wlGradientFrom: true,
        wlGradientTo: true,
        wlLogoMode: true,
        wlLogoHeight: true,
        wlHeaderAlign: true,
      },
    }),
    getEffectiveLimits(m.agencyId),
  ]);

  if (!agency) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-fuchsia-600" />
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
          White-label
        </h1>
      </div>
      <p className="mt-1 text-[13px] text-zinc-500">
        Reemplaza &quot;MarketaFlow&quot; con tu propio branding en los lugares
        que ven tus clientes: páginas públicas de revisión, emails y footers.
      </p>

      {!limits.whiteLabelEnabled ? (
        <div className="card mt-6 p-6">
          <p className="text-[14px] font-semibold text-zinc-900">
            White-label no está activo en tu plan
          </p>
          <p className="mt-1 text-[12px] text-zinc-500">
            Para usar tu propio branding tienes que estar en el plan Agency
            (que lo incluye) o comprar el add-on White-label encima de Pro
            ($59.000 COP/mes).
          </p>
          <Link
            href="/billing"
            className="btn-gradient mt-4 inline-block rounded-md px-4 py-2 text-[12px] font-semibold"
          >
            Ver opciones
          </Link>
        </div>
      ) : (
        <div className="mt-6">
          <WhiteLabelEditor
            agencyName={agency.name}
            initial={{
              brandName: agency.wlBrandName,
              logoUrl: agency.wlLogoUrl,
              accentColor: agency.wlAccentColor,
              gradientFrom: agency.wlGradientFrom,
              gradientTo: agency.wlGradientTo,
              logoMode: agency.wlLogoMode,
              logoHeight: agency.wlLogoHeight,
              headerAlign: agency.wlHeaderAlign,
            }}
          />
        </div>
      )}

      <div className="mt-6 rounded-lg border border-zinc-200 bg-zinc-50/40 p-4 text-[11.5px] text-zinc-600">
        <p className="font-semibold text-zinc-800">¿Dónde se aplica?</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          <li>
            <strong>Toda la UI interna</strong>: sidebar, dashboard,
            settings, planes — tu logo y nombre reemplazan a MarketaFlow,
            y los colores del gradient se aplican a botones, badges,
            indicadores activos y CTAs.
          </li>
          <li>Página pública de revisión (cuando compartes un feed via link)</li>
          <li>Emails (invitación, pago confirmado, pago fallido)</li>
          <li>Footer de las páginas que ven tus clientes externos</li>
        </ul>
        <p className="mt-2 text-zinc-500">
          Refresca después de guardar para ver el cambio aplicado en el
          sidebar y en toda la app.
        </p>
      </div>
    </div>
  );
}
