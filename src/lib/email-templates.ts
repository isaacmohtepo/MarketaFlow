import { appUrl } from "./email";

const BRAND_GRADIENT =
  "linear-gradient(135deg, #3b5fff 0%, #8a2be2 35%, #ff4d8f 70%, #ff2d55 100%)";

/**
 * Escapa caracteres HTML peligrosos. Toda variable user-controlled (nombres,
 * notas, captions, body) DEBE pasar por esta función antes de inyectarse en
 * el template. Sin esto, un attacker con un brand.name = "<script>..." podría
 * inyectar phishing links, scripts (en email clients que los ejecutan), o
 * elementos HTML que cambien el sentido del email.
 *
 * Acepta null/undefined → string vacío para que sea conveniente en templates.
 */
function esc(value: unknown): string {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Branding inyectable en cualquier email. Si se pasa `wl`, reemplaza
 *  el header (logo + nombre) y el color del CTA. Si null/undefined,
 *  usa el branding default de MarketaFlow. */
export type EmailBranding = {
  brandName: string;
  logoUrl: string | null;
  accentColor: string | null;
} | null;

function shell({
  preheader,
  title,
  intro,
  ctaLabel,
  ctaUrl,
  footer,
  wl,
}: {
  preheader: string;
  title: string;
  intro: string;
  ctaLabel: string;
  ctaUrl: string;
  footer?: string;
  wl?: EmailBranding;
}): string {
  // Resolver branding: si la agency tiene white-label, usar su logo /
  // nombre / color. Sino, mostrar el chip MarketaFlow default.
  const headerBrand = wl
    ? wl.logoUrl
      ? `<img src="${esc(wl.logoUrl)}" alt="${esc(wl.brandName)}" width="24" height="24" style="display:inline-block;width:24px;height:24px;border-radius:6px;object-fit:contain;vertical-align:middle;" /> <span style="font-weight:600;font-size:14px;letter-spacing:-0.01em;vertical-align:middle;margin-left:6px;">${esc(wl.brandName)}</span>`
      : `<span style="display:inline-block;width:24px;height:24px;border-radius:6px;background:${esc(wl.accentColor ?? "#8a2be2")};vertical-align:middle;"></span> <span style="font-weight:600;font-size:14px;letter-spacing:-0.01em;vertical-align:middle;margin-left:6px;">${esc(wl.brandName)}</span>`
    : `<span style="display:inline-block;width:24px;height:24px;border-radius:6px;background:${BRAND_GRADIENT};vertical-align:middle;"></span> <span style="font-weight:600;font-size:14px;letter-spacing:-0.01em;vertical-align:middle;margin-left:6px;">MarketaFlow</span>`;
  const ctaBg = wl?.accentColor ?? BRAND_GRADIENT;
  const footerBrandName = wl?.brandName ?? "MarketaFlow";
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <title>${title}</title>
  </head>
  <body style="margin:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',system-ui,sans-serif;color:#1d1d1f;">
    <span style="display:none;visibility:hidden;opacity:0;color:transparent;height:0;width:0;">${preheader}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid rgba(0,0,0,0.08);border-radius:14px;overflow:hidden;">
            <tr>
              <td style="padding:24px 28px 0;">
                ${headerBrand}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px 8px;">
                <h1 style="margin:0;font-size:22px;line-height:1.25;letter-spacing:-0.02em;color:#1d1d1f;">${title}</h1>
                <p style="margin:10px 0 0;font-size:14px;line-height:1.55;color:#3a3a3f;">${intro}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px 28px;">
                <a href="${ctaUrl}" style="display:inline-block;background:${ctaBg};color:#ffffff;text-decoration:none;font-weight:600;font-size:13px;padding:11px 22px;border-radius:9999px;">
                  ${ctaLabel}
                </a>
              </td>
            </tr>
            ${
              footer
                ? `<tr><td style="padding:0 28px 24px;font-size:12px;color:#6e6e73;line-height:1.5;">${footer}</td></tr>`
                : ""
            }
          </table>
          <p style="margin:18px 0 0;font-size:11px;color:#86868b;line-height:1.4;">
            Recibiste este correo porque tu cuenta tiene notificaciones activas.<br/>
            <a href="${appUrl("/account")}" style="color:#86868b;text-decoration:underline;">Cambiar preferencias</a>
            ${wl ? `<br/><span style="color:#a8a8ad;">Powered by ${esc(footerBrandName)}</span>` : ""}
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function tplPostInReview(opts: {
  brandName: string;
  agencyName: string;
  actorName: string;
  postUrl: string;
  caption?: string | null;
  wl?: EmailBranding;
}) {
  const captionTrunc = opts.caption
    ? opts.caption.slice(0, 140) + (opts.caption.length > 140 ? "…" : "")
    : "";
  const captionLine = opts.caption
    ? `<p style="margin:14px 0 0;font-size:13px;color:#6e6e73;font-style:italic;border-left:2px solid #e4e4e7;padding-left:10px;">"${esc(captionTrunc)}"</p>`
    : "";
  const footerBrand = opts.wl?.brandName ?? "MarketaFlow";
  return shell({
    preheader: `${esc(opts.actorName)} subió un post de ${esc(opts.brandName)} para tu revisión`,
    title: `Hay un post de ${esc(opts.brandName)} para revisar`,
    intro: `${esc(opts.actorName)} acaba de enviarte un post para que apruebes o pidas cambios.${captionLine}`,
    ctaLabel: "Ver y aprobar →",
    ctaUrl: opts.postUrl,
    footer: `Si lo apruebas, ${esc(footerBrand)} lo programa automáticamente. Si pides cambios, ${esc(opts.agencyName)} recibirá tu nota.`,
    wl: opts.wl,
  });
}

export function tplPostApproved(opts: {
  brandName: string;
  clientName: string;
  postUrl: string;
  wl?: EmailBranding;
}) {
  return shell({
    preheader: `${esc(opts.clientName)} aprobó un post de ${esc(opts.brandName)}`,
    title: `${esc(opts.clientName)} aprobó un post 🎉`,
    intro: `Buenas noticias — el post de <strong>${esc(opts.brandName)}</strong> está listo para programarse.`,
    ctaLabel: "Ver post",
    ctaUrl: opts.postUrl,
    wl: opts.wl,
  });
}

export function tplChangesRequested(opts: {
  brandName: string;
  clientName: string;
  note?: string | null;
  postUrl: string;
  wl?: EmailBranding;
}) {
  const noteBlock = opts.note
    ? `<p style="margin:14px 0 0;font-size:13px;color:#1d1d1f;background:#fff5f5;border-left:3px solid #ff4d8f;padding:10px 12px;border-radius:6px;">"${esc(opts.note)}"</p>`
    : "";
  return shell({
    preheader: `${esc(opts.clientName)} pidió cambios en un post de ${esc(opts.brandName)}`,
    title: `${esc(opts.clientName)} pidió cambios`,
    intro: `Hay un post de <strong>${esc(opts.brandName)}</strong> que necesita correcciones.${noteBlock}`,
    ctaLabel: "Ver comentarios",
    ctaUrl: opts.postUrl,
    wl: opts.wl,
  });
}

export function tplCommentMention(opts: {
  brandName: string;
  actorName: string;
  body: string;
  postUrl: string;
}) {
  // Trunca primero, después escapa, después aplica el highlight de menciones.
  // Importante: el highlight regex debe correr SOBRE EL HTML ESCAPED para que
  // un body tipo `</span><script>` no rompa nuestro markup. Las menciones
  // (@nombre) son ASCII y no se ven afectadas por escape de HTML.
  const trunc = opts.body.length > 280 ? `${opts.body.slice(0, 277)}…` : opts.body;
  const escapedBody = esc(trunc);
  const highlighted = escapedBody.replace(
    /@(?:&quot;[^&]+&quot;|[\w.\-áéíóúñÁÉÍÓÚÑ]+)/g,
    (m) => `<span style="color:#8a2be2;font-weight:600;">${m}</span>`,
  );
  return shell({
    preheader: `${esc(opts.actorName)} te mencionó en ${esc(opts.brandName)}`,
    title: `${esc(opts.actorName)} te mencionó`,
    intro: `En el post de <strong>${esc(opts.brandName)}</strong>:<br/><span style="display:inline-block;margin-top:10px;font-size:13px;color:#1d1d1f;background:#faf5ff;border-left:3px solid #8a2be2;padding:10px 12px;border-radius:6px;">"${highlighted}"</span>`,
    ctaLabel: "Ver comentario",
    ctaUrl: opts.postUrl,
  });
}

// ============================================================================
// Templates de billing
// ============================================================================

export function tplTrialEnding(opts: {
  agencyName: string;
  daysLeft: number;
  planName: string;
}) {
  return shell({
    preheader: `Tu trial de ${esc(opts.planName)} termina en ${opts.daysLeft} días`,
    title: `Tu trial termina pronto ⏰`,
    intro: `Faltan <strong>${opts.daysLeft} ${
      opts.daysLeft === 1 ? "día" : "días"
    }</strong> para que termine tu trial de <strong>${esc(opts.planName)}</strong> en ${esc(opts.agencyName)}. Si no agregás un método de pago, bajamos automáticamente a Free y vas a perder algunos límites (marcas, posts, equipo).`,
    ctaLabel: "Activar suscripción",
    ctaUrl: `${appUrl("/billing")}`,
    footer: "Podés cancelar en cualquier momento.",
  });
}

export function tplTrialEnded(opts: { agencyName: string }) {
  return shell({
    preheader: `Tu trial terminó — ahora estás en plan Free`,
    title: `Tu trial terminó`,
    intro: `Tu trial de <strong>${esc(opts.agencyName)}</strong> terminó. Ahora estás en el plan <strong>Free</strong> con sus límites (1 marca, 30 posts/mes, 1 cliente). Las marcas y posts que tenías de más quedan visibles pero en read-only hasta que upgradees.`,
    ctaLabel: "Ver planes",
    ctaUrl: `${appUrl("/billing")}`,
  });
}

export function tplPaymentSuccess(opts: {
  agencyName: string;
  amount: string;
  planName: string;
  periodEnd: string;
  invoiceUrl?: string;
}) {
  return shell({
    preheader: `Recibimos tu pago de ${esc(opts.amount)}`,
    title: `Pago confirmado 🎉`,
    intro: `Cobramos <strong>${esc(opts.amount)}</strong> por tu plan <strong>${esc(opts.planName)}</strong> de ${esc(opts.agencyName)}. Tu próxima renovación es el ${esc(opts.periodEnd)}.`,
    ctaLabel: opts.invoiceUrl ? "Ver factura" : "Ir a Facturación",
    ctaUrl: opts.invoiceUrl ?? `${appUrl("/billing")}`,
  });
}

export function tplPaymentFailed(opts: {
  agencyName: string;
  amount: string;
  reason?: string;
}) {
  const reasonBlock = opts.reason
    ? `<p style="margin:14px 0 0;font-size:13px;color:#1d1d1f;background:#fff5f5;border-left:3px solid #ff4d8f;padding:10px 12px;border-radius:6px;">${esc(opts.reason)}</p>`
    : "";
  return shell({
    preheader: `No pudimos cobrar tu suscripción`,
    title: `El pago falló`,
    intro: `Intentamos cobrar <strong>${esc(opts.amount)}</strong> en ${esc(opts.agencyName)} pero el método de pago rechazó el cargo.${reasonBlock} Tenés 3 días de gracia antes de que bajemos al plan Free. Actualizá tu tarjeta para evitar perder acceso.`,
    ctaLabel: "Actualizar pago",
    ctaUrl: `${appUrl("/billing")}`,
  });
}

export function tplSubscriptionCanceled(opts: {
  agencyName: string;
  endDate: string;
  planName: string;
}) {
  return shell({
    preheader: `Cancelaste tu suscripción de ${esc(opts.planName)}`,
    title: `Suscripción cancelada`,
    intro: `Cancelaste tu suscripción de <strong>${esc(opts.planName)}</strong> en ${esc(opts.agencyName)}. Tu plan sigue activo hasta el <strong>${esc(opts.endDate)}</strong> — después bajamos a Free. Podés reactivarla en cualquier momento.`,
    ctaLabel: "Ir a Facturación",
    ctaUrl: `${appUrl("/billing")}`,
  });
}

export function tplPostPublished(opts: {
  brandName: string;
  postUrl: string;
  publishedUrl?: string | null;
}) {
  // publishedUrl viene de la API de Instagram/Facebook — confiamos en que es
  // una URL válida pero igual la escapamos como atributo href por seguridad.
  const publishedLink =
    opts.publishedUrl && /^https?:\/\//i.test(opts.publishedUrl)
      ? ` <a href="${esc(opts.publishedUrl)}" style="color:#8a2be2;">Ver en redes ↗</a>`
      : "";
  return shell({
    preheader: `Un post de ${esc(opts.brandName)} se publicó`,
    title: `Tu post se publicó ✨`,
    intro: `El post de <strong>${esc(opts.brandName)}</strong> ya está en línea.${publishedLink}`,
    ctaLabel: "Ver detalle",
    ctaUrl: opts.postUrl,
  });
}
