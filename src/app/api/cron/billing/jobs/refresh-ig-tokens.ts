import { prisma } from "@/lib/db";
import {
  getIgAccessToken,
  setIgAccessToken,
  markIgNeedsReconnect,
} from "@/lib/instagram-token";
import { sendEmail } from "@/lib/email";

/**
 * Refresh automático de tokens de Instagram.
 *
 * Meta da tokens long-lived que duran 60 días. Cuando vencen, la
 * publicación falla con OAuthException #190 — el usuario tiene que
 * volver a conectar la cuenta. Para evitar eso, este cron renueva los
 * tokens proactivamente cuando llevan más de 30 días desde la última
 * renovación (mitad de su vida útil, da margen).
 *
 * Para renovar, intercambiamos el token actual por uno nuevo via
 * `grant_type=fb_exchange_token`. Si Meta rechaza con error 190 (token
 * expirado/revocado), marcamos la brand con `igConnectionStatus =
 * "needs_reconnect"` y mandamos email al owner.
 *
 * Idempotente: si Meta no está configurada (sin META_APP_ID/SECRET) o
 * no hay brands para refresh, retorna 0.
 */
const GRAPH_BASE = "https://graph.facebook.com/v21.0";
const REFRESH_THRESHOLD_DAYS = 30;

export async function runIgTokenRefresh(): Promise<{
  refreshed: number;
  needsReconnect: number;
  skipped: number;
  errors: number;
}> {
  const stats = { refreshed: 0, needsReconnect: 0, skipped: 0, errors: 0 };

  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    // Meta no configurada — no podemos refrescar nada
    return stats;
  }

  const cutoff = new Date(Date.now() - REFRESH_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);
  // Brands con token encriptado Y (sin refreshedAt registrado O refreshedAt
  // viejo). Las brands sin token (desconectadas) y las que ya tienen
  // needs_reconnect se saltan.
  const candidates = await prisma.brand.findMany({
    where: {
      igAccessTokenEnc: { not: null },
      OR: [
        { igTokenRefreshedAt: null },
        { igTokenRefreshedAt: { lt: cutoff } },
      ],
      NOT: { igConnectionStatus: "needs_reconnect" },
    },
    include: {
      agency: {
        include: {
          members: {
            where: { role: "owner", brandId: null },
            include: { user: { select: { email: true } } },
            take: 1,
          },
        },
      },
    },
    take: 100,
  });

  for (const brand of candidates) {
    try {
      const currentToken = await getIgAccessToken(brand.id);
      if (!currentToken) {
        stats.skipped++;
        continue;
      }
      const res = await fetch(
        `${GRAPH_BASE}/oauth/access_token?` +
          new URLSearchParams({
            grant_type: "fb_exchange_token",
            client_id: appId,
            client_secret: appSecret,
            fb_exchange_token: currentToken,
          }).toString(),
      );
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: { code?: number; type?: string; message?: string };
        };
        const code = json.error?.code;
        // 190 = OAuthException → token revocado o expirado.
        // Otros errores transitorios (rate limit, 5xx) los reintentamos
        // mañana sin marcar needs_reconnect.
        if (code === 190 || res.status === 400) {
          await markIgNeedsReconnect(brand.id);
          stats.needsReconnect++;
          // Email al owner
          const ownerEmail = brand.agency.members[0]?.user.email;
          if (ownerEmail && !ownerEmail.endsWith("@guest.local")) {
            await sendEmail({
              to: ownerEmail,
              subject: `Reconectá Instagram para ${brand.name}`,
              html: `
                <p style="font-family:system-ui,sans-serif;color:#1d1d1f;line-height:1.6">
                  Hola,<br/><br/>
                  El token de acceso a Instagram para la marca
                  <strong>${escapeHtml(brand.name)}</strong> caducó o fue revocado.
                  Mientras no se reconecte, los posts programados no se van a
                  publicar automáticamente.<br/><br/>
                  Andá a Configuración → Instagram en MarketaFlow y conectá
                  la cuenta de nuevo. Es solo 1 click.
                </p>
              `,
            }).catch((e) => console.error("ig-reconnect email failed", e));
          }
        } else {
          stats.errors++;
        }
        continue;
      }
      const json = (await res.json()) as { access_token?: string };
      if (!json.access_token) {
        stats.errors++;
        continue;
      }
      await setIgAccessToken(brand.id, json.access_token);
      stats.refreshed++;
    } catch (err) {
      const { safeLogError } = await import("@/lib/safe-log");
      safeLogError(`ig-token refresh error brand=${brand.id}`, err);
      stats.errors++;
    }
  }
  return stats;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
