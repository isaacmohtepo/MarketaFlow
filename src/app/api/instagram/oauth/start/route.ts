import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getBrandAccess, hasPermission } from "@/lib/permissions";

/**
 * GET /api/instagram/oauth/start?brandId=xxx
 *
 * Inicia el flow OAuth de Meta para conectar Instagram. Genera un state
 * token (CSRF) firmado en cookie y redirige al consent screen de Meta.
 *
 * Requiere env:
 *   META_APP_ID — ID de la app de Meta en developers.facebook.com
 *   META_APP_SECRET — secret correspondiente (usado en callback)
 *
 * Si las env no están seteadas, devolvemos un error explicando el setup.
 *
 * NOTA: Meta requiere que la app esté en "Live mode" y que el dominio del
 * redirect URI esté agregado en Settings → App Domains. En "Development
 * mode" solo funciona para developers/testers explícitamente agregados.
 */
const META_OAUTH_URL = "https://www.facebook.com/v21.0/dialog/oauth";
const SCOPES = [
  "instagram_basic",
  "instagram_content_publish",
  "pages_show_list",
  "pages_read_engagement",
  "business_management",
];

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const url = new URL(req.url);
  const brandId = url.searchParams.get("brandId");
  if (!brandId) {
    return NextResponse.json({ error: "Falta brandId" }, { status: 400 });
  }

  const access = await getBrandAccess(user.id, brandId);
  if (!access) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  const ok = await hasPermission(user.id, access.agencyId, "instagram.manage", brandId);
  if (!ok) {
    return NextResponse.json({ error: "Sin permiso: instagram.manage" }, { status: 403 });
  }

  const appId = process.env.META_APP_ID;
  if (!appId) {
    return NextResponse.json(
      {
        error:
          "OAuth no configurado. Setteá META_APP_ID y META_APP_SECRET en Vercel para habilitar 'Conectar con Instagram'. Mientras tanto, usá la conexión manual con tokens.",
      },
      { status: 503 },
    );
  }

  // CSRF token: firmamos un random + brandId + userId en una cookie de sesión
  // corta. El callback verifica contra esto.
  const state = randomBytes(24).toString("hex");
  const jar = await cookies();
  jar.set(
    "mf_ig_oauth",
    JSON.stringify({ state, brandId, userId: user.id }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 600, // 10 min
      path: "/",
    },
  );

  // Build redirect URI desde el host del request
  const origin =
    process.env.APP_URL ?? `${url.protocol}//${url.host}`;
  const redirectUri = `${origin.replace(/\/+$/, "")}/api/instagram/oauth/callback`;

  const authUrl = new URL(META_OAUTH_URL);
  authUrl.searchParams.set("client_id", appId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", SCOPES.join(","));
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("response_type", "code");

  return NextResponse.redirect(authUrl.toString());
}
