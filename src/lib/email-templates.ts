import { appUrl } from "./email";

const BRAND_GRADIENT =
  "linear-gradient(135deg, #3b5fff 0%, #8a2be2 35%, #ff4d8f 70%, #ff2d55 100%)";

function shell({
  preheader,
  title,
  intro,
  ctaLabel,
  ctaUrl,
  footer,
}: {
  preheader: string;
  title: string;
  intro: string;
  ctaLabel: string;
  ctaUrl: string;
  footer?: string;
}): string {
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
                <div style="display:flex;align-items:center;gap:8px;">
                  <span style="display:inline-block;width:24px;height:24px;border-radius:6px;background:${BRAND_GRADIENT};"></span>
                  <span style="font-weight:600;font-size:14px;letter-spacing:-0.01em;">MarketaFlow</span>
                </div>
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
                <a href="${ctaUrl}" style="display:inline-block;background:${BRAND_GRADIENT};color:#ffffff;text-decoration:none;font-weight:600;font-size:13px;padding:11px 22px;border-radius:9999px;">
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
}) {
  const captionLine = opts.caption
    ? `<p style="margin:14px 0 0;font-size:13px;color:#6e6e73;font-style:italic;border-left:2px solid #e4e4e7;padding-left:10px;">"${opts.caption.slice(0, 140)}${opts.caption.length > 140 ? "…" : ""}"</p>`
    : "";
  return shell({
    preheader: `${opts.actorName} subió un post de ${opts.brandName} para tu revisión`,
    title: `Hay un post de ${opts.brandName} para revisar`,
    intro: `${opts.actorName} acaba de enviarte un post para que apruebes o pidas cambios.${captionLine}`,
    ctaLabel: "Ver y aprobar →",
    ctaUrl: opts.postUrl,
    footer: `Si lo apruebas, MarketaFlow lo programa automáticamente. Si pides cambios, ${opts.agencyName} recibirá tu nota.`,
  });
}

export function tplPostApproved(opts: {
  brandName: string;
  clientName: string;
  postUrl: string;
}) {
  return shell({
    preheader: `${opts.clientName} aprobó un post de ${opts.brandName}`,
    title: `${opts.clientName} aprobó un post 🎉`,
    intro: `Buenas noticias — el post de <strong>${opts.brandName}</strong> está listo para programarse.`,
    ctaLabel: "Ver post",
    ctaUrl: opts.postUrl,
  });
}

export function tplChangesRequested(opts: {
  brandName: string;
  clientName: string;
  note?: string | null;
  postUrl: string;
}) {
  const noteBlock = opts.note
    ? `<p style="margin:14px 0 0;font-size:13px;color:#1d1d1f;background:#fff5f5;border-left:3px solid #ff4d8f;padding:10px 12px;border-radius:6px;">"${opts.note}"</p>`
    : "";
  return shell({
    preheader: `${opts.clientName} pidió cambios en un post de ${opts.brandName}`,
    title: `${opts.clientName} pidió cambios`,
    intro: `Hay un post de <strong>${opts.brandName}</strong> que necesita correcciones.${noteBlock}`,
    ctaLabel: "Ver comentarios",
    ctaUrl: opts.postUrl,
  });
}

export function tplPostPublished(opts: {
  brandName: string;
  postUrl: string;
  publishedUrl?: string | null;
}) {
  return shell({
    preheader: `Un post de ${opts.brandName} se publicó`,
    title: `Tu post se publicó ✨`,
    intro: `El post de <strong>${opts.brandName}</strong> ya está en línea.${opts.publishedUrl ? ` <a href="${opts.publishedUrl}" style="color:#8a2be2;">Ver en redes ↗</a>` : ""}`,
    ctaLabel: "Ver detalle",
    ctaUrl: opts.postUrl,
  });
}
