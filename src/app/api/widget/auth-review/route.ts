import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

// Valida que un token de review (= brand.publicToken) corresponda al widgetToken.
// Si coinciden ambos en la misma brand, devuelve {ok, brandName}.
// Lo llama el widget cuando detecta ?mfreview=<token> en la URL.
export async function POST(req: Request) {
  // Rate limit: 20/min por IP — el widget llama esto 1 vez por carga,
  // 20 cubre uso real y bloquea attempts de brute force de tokens.
  const rl = rateLimit(req, {
    key: "widget-auth-review",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many attempts" },
      { status: 429, headers: CORS },
    );
  }

  let body: { widgetToken?: string; reviewToken?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400, headers: CORS });
  }

  const widgetToken = (body.widgetToken ?? "").trim();
  const reviewToken = (body.reviewToken ?? "").trim();
  if (!widgetToken || !reviewToken) {
    return NextResponse.json({ ok: false, error: "missing tokens" }, { status: 400, headers: CORS });
  }

  const brand = await prisma.brand.findFirst({
    where: { widgetToken, publicToken: reviewToken },
    select: { id: true, name: true },
  });

  if (!brand) {
    return NextResponse.json(
      { ok: false, error: "tokens no coinciden o marca no encontrada" },
      { status: 403, headers: CORS },
    );
  }

  return NextResponse.json({ ok: true, brandName: brand.name }, { headers: CORS });
}
