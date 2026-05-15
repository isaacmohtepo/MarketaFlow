import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";

/**
 * GET /api/instagram/oauth/callback?code=...&state=...
 *
 * Recibe el callback de Meta, verifica state (CSRF), intercambia code por
 * short-lived token, lo extiende a long-lived (60 días), busca el IG
 * Business Account asociado a las páginas del user, y guarda en Brand.
 *
 * Si algo falla, redirigimos a /brands/[brandId]/settings/instagram?error=...
 */
const GRAPH_BASE = "https://graph.facebook.com/v21.0";

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.redirect(new URL("/login", req.url));

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  // CSRF: leer el cookie firmado
  const jar = await cookies();
  const stateCookie = jar.get("mf_ig_oauth")?.value;
  jar.delete("mf_ig_oauth");

  if (!stateCookie) {
    return NextResponse.redirect(
      new URL("/dashboard?ig_error=missing_state", req.url),
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(stateCookie) as {
      state: string;
      brandId: string;
      userId: string;
    };
  } catch {
    return NextResponse.redirect(
      new URL("/dashboard?ig_error=bad_state", req.url),
    );
  }

  const settingsUrl = `/brands/${parsed.brandId}/settings/instagram`;

  if (parsed.userId !== me.id || parsed.state !== state) {
    return NextResponse.redirect(
      new URL(`${settingsUrl}?error=csrf`, req.url),
    );
  }

  if (errorParam || !code) {
    return NextResponse.redirect(
      new URL(`${settingsUrl}?error=denied`, req.url),
    );
  }

  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    return NextResponse.redirect(
      new URL(`${settingsUrl}?error=not_configured`, req.url),
    );
  }

  const origin = process.env.APP_URL ?? `${url.protocol}//${url.host}`;
  const redirectUri = `${origin.replace(/\/+$/, "")}/api/instagram/oauth/callback`;

  try {
    // 1. Intercambiar code → short-lived token
    const tokenRes = await fetch(
      `${GRAPH_BASE}/oauth/access_token?` +
        new URLSearchParams({
          client_id: appId,
          client_secret: appSecret,
          redirect_uri: redirectUri,
          code,
        }).toString(),
    );
    if (!tokenRes.ok) {
      throw new Error(`token_exchange ${tokenRes.status}: ${await tokenRes.text()}`);
    }
    const tokenJson = (await tokenRes.json()) as { access_token: string };

    // 2. Convertir a long-lived (60 días)
    const longRes = await fetch(
      `${GRAPH_BASE}/oauth/access_token?` +
        new URLSearchParams({
          grant_type: "fb_exchange_token",
          client_id: appId,
          client_secret: appSecret,
          fb_exchange_token: tokenJson.access_token,
        }).toString(),
    );
    if (!longRes.ok) {
      throw new Error(`long_lived ${longRes.status}: ${await longRes.text()}`);
    }
    const longJson = (await longRes.json()) as { access_token: string };
    const longLivedToken = longJson.access_token;

    // 3. Buscar páginas del user
    const pagesRes = await fetch(
      `${GRAPH_BASE}/me/accounts?fields=id,name,instagram_business_account&access_token=${longLivedToken}`,
    );
    if (!pagesRes.ok) {
      throw new Error(`pages ${pagesRes.status}: ${await pagesRes.text()}`);
    }
    const pagesJson = (await pagesRes.json()) as {
      data?: {
        id: string;
        name: string;
        instagram_business_account?: { id: string };
      }[];
    };
    const pageWithIg = pagesJson.data?.find((p) => p.instagram_business_account);
    if (!pageWithIg || !pageWithIg.instagram_business_account) {
      return NextResponse.redirect(
        new URL(`${settingsUrl}?error=no_ig_account`, req.url),
      );
    }
    const igUserId = pageWithIg.instagram_business_account.id;

    // 4. Guardar en Brand (token encriptado via helper)
    const { setIgAccessToken } = await import("@/lib/instagram-token");
    await setIgAccessToken(parsed.brandId, longLivedToken, { igUserId });

    audit({
      category: "team",
      action: "brand.instagram_connected_oauth",
      actorUserId: me.id,
      actorEmail: me.email,
      targetId: parsed.brandId,
      metadata: { igUserId, pageId: pageWithIg.id, pageName: pageWithIg.name },
      req,
    });

    return NextResponse.redirect(new URL(`${settingsUrl}?success=1`, req.url));
  } catch (err) {
    console.error("IG OAuth callback failed", err);
    const msg = err instanceof Error ? err.message : "unknown";
    return NextResponse.redirect(
      new URL(
        `${settingsUrl}?error=oauth_failed&detail=${encodeURIComponent(msg.slice(0, 200))}`,
        req.url,
      ),
    );
  }
}
