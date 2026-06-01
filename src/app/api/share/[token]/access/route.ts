import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { createSession, hashPassword } from "@/lib/auth";
import { canInviteClient } from "@/lib/billing";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

const schema = z.object({
  name: z.string().min(1).max(80),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  // Rate limit: 5 accesos guest por IP por hora — un cliente real entra 1-2
  // veces; más de 5 en una hora desde la misma IP es spam/abuso
  const rl = rateLimit(req, { key: "share-access", limit: 5, windowMs: 60 * 60_000 });
  if (!rl.ok) return rateLimitResponse(rl);

  const { token } = await params;

  const brand = await prisma.brand.findUnique({
    where: { publicToken: token },
    include: { agency: true },
  });
  if (!brand) {
    return NextResponse.json({ error: "Link inválido" }, { status: 404 });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });
  }

  const guestId = randomBytes(8).toString("hex");
  const email = `guest_${guestId}@guest.local`;
  const passwordHash = await hashPassword(randomBytes(16).toString("hex"));

  // Plan limits enforcement + create en una Serializable transaction. Sin esto
  // múltiples accesos paralelos al share link podían pasar ambos el check
  // y generar más clients de los que el plan permite.
  const txResult = await prisma.$transaction(
    async (tx) => {
      const check = await canInviteClient(brand.id, tx);
      if (!check.ok) return { ok: false as const };
      const created = await tx.user.create({
        data: {
          name: body.name,
          email,
          passwordHash,
          role: "client",
          memberships: {
            create: {
              agencyId: brand.agencyId,
              brandId: brand.id,
              role: "client",
            },
          },
        },
      });
      return { ok: true as const, user: created };
    },
    { isolationLevel: "Serializable" },
  );

  if (!txResult.ok) {
    return NextResponse.json(
      {
        error:
          "Esta marca no acepta más clientes en su plan actual. Contacta a la agencia.",
      },
      { status: 402 },
    );
  }
  const user = txResult.user;

  await createSession(user.id, {
    userAgent: req.headers.get("user-agent"),
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });
  return NextResponse.json({ ok: true, brandId: brand.id });
}
