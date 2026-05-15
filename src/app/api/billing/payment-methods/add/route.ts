import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getWompiConfig, resolveWompiEnvironment } from "@/lib/integrations";
import { audit } from "@/lib/audit";

/**
 * POST /api/billing/payment-methods/add
 *
 * Agrega un método de pago SIN cobrar. La browser ya tokenizó la
 * tarjeta o el user pasó el teléfono Nequi. Nosotros creamos el
 * payment_source en Wompi y guardamos la PaymentMethod row.
 *
 * Flow tarjeta:
 *  1. Browser POST a Wompi /v1/tokens/cards con datos de tarjeta + public key
 *  2. Wompi devuelve card token + display info (last4, brand, exp, holder)
 *  3. Browser POST acá con { type: "CARD", cardToken, last4, brand, ... }
 *  4. Nosotros POST a Wompi /v1/payment_sources con token + acceptance_token
 *  5. Wompi devuelve payment_source_id reusable
 *  6. Guardamos PaymentMethod row (no cobramos nada)
 *
 * Flow Nequi:
 *  1. Browser POST acá con { type: "NEQUI", phoneNumber }
 *  2. Nosotros POST a Wompi /v1/payment_sources con type=NEQUI + phone + acceptance
 *  3. Wompi devuelve payment_source en estado PENDING
 *  4. Wompi manda push al teléfono. User confirma en su app Nequi.
 *  5. Cuando confirma, queda usable. Si no confirma en 5min, source declined.
 *  6. Guardamos PaymentMethod row con state pendiente.
 */

const cardSchema = z.object({
  type: z.literal("CARD"),
  cardToken: z.string().min(1),
  // Mantenemos los campos opcionales en el schema para no romper clientes
  // viejos que todavía los mandan — el server los ignora y fetchea sus
  // propios tokens frescos para evitar "token already used".
  acceptanceToken: z.string().optional(),
  acceptancePersonalDataAuthToken: z.string().optional(),
  // Display info (vienen del response de tokenize, los pasamos para evitar
  // un round-trip extra; el server igual los podría sacar de la tarjeta).
  last4: z.string().regex(/^\d{4}$/),
  brand: z.string().min(2),
  expMonth: z.number().int().min(1).max(12),
  expYear: z.number().int().min(2024).max(2100),
  cardHolder: z.string().min(2).max(100),
});

const nequiSchema = z.object({
  type: z.literal("NEQUI"),
  phoneNumber: z.string().regex(/^3\d{9}$/, "Teléfono Nequi inválido — 10 dígitos empezando con 3"),
  // Idem CARD: opcionales, el server fetchea los suyos siempre.
  acceptanceToken: z.string().optional(),
  acceptancePersonalDataAuthToken: z.string().optional(),
});

const schema = z.discriminatedUnion("type", [cardSchema, nequiSchema]);

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const m = await prisma.membership.findFirst({
    where: { userId: user.id, brandId: null },
    select: { agencyId: true },
  });
  if (!m) return NextResponse.json({ error: "Sin agencia" }, { status: 403 });

  if (!(await hasPermission(user.id, m.agencyId, "billing.manage"))) {
    return NextResponse.json(
      { error: "Sin permiso: billing.manage" },
      { status: 403 },
    );
  }

  const sub = await prisma.subscription.findUnique({
    where: { agencyId: m.agencyId },
  });
  if (!sub) {
    return NextResponse.json({ error: "Sin subscription" }, { status: 404 });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Datos inválidos";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const env = await resolveWompiEnvironment();
  if (!env) {
    return NextResponse.json(
      { error: "Wompi no configurado en /admin/integrations" },
      { status: 503 },
    );
  }
  const cfg = await getWompiConfig(env);
  const apiBase =
    env === "production"
      ? "https://production.wompi.co/v1"
      : "https://sandbox.wompi.co/v1";

  // Pedir acceptance_tokens FRESCOS justo antes de crear el payment_source.
  // Antes recibíamos los tokens del browser (fetched al abrir el modal),
  // pero esos tokens son single-use: si el primer intento fallaba o el
  // modal se cerraba/abría, el segundo intento reusaba el mismo token y
  // Wompi rechazaba con "El token de aceptación ya fue usado".
  // Pidiéndolos server-side por cada request, garantizamos que siempre
  // sean nuevos.
  let acceptanceToken: string | null = null;
  let acceptancePersonalDataAuthToken: string | null = null;
  try {
    const merchantRes = await fetch(
      `${apiBase}/merchants/${encodeURIComponent(cfg.publicKey)}`,
      { cache: "no-store" },
    );
    if (merchantRes.ok) {
      const j = (await merchantRes.json()) as {
        data?: {
          presigned_acceptance?: { acceptance_token?: string };
          presigned_personal_data_auth?: { acceptance_token?: string };
        };
      };
      acceptanceToken = j.data?.presigned_acceptance?.acceptance_token ?? null;
      acceptancePersonalDataAuthToken =
        j.data?.presigned_personal_data_auth?.acceptance_token ?? null;
    }
  } catch (err) {
    console.error("Failed to fetch fresh Wompi acceptance tokens", err);
  }
  if (!acceptanceToken) {
    return NextResponse.json(
      {
        error:
          "No pudimos obtener el token de aceptación de Wompi. Probá de nuevo en unos segundos.",
      },
      { status: 503 },
    );
  }

  // Nequi requiere `accept_personal_auth` OBLIGATORIO (en sandbox y en
  // producción). Si Wompi no devolvió presigned_personal_data_auth en
  // merchants/.., no podemos seguir con Nequi.
  if (body.type === "NEQUI" && !acceptancePersonalDataAuthToken) {
    return NextResponse.json(
      {
        error:
          "Wompi no devolvió el token de autorización de datos personales. Probá de nuevo o contactá soporte.",
      },
      { status: 503 },
    );
  }

  // Validación adicional del email: Wompi rechaza emails internos
  // como "*@guest.local" que usamos para users guest.
  if (!user.email || user.email.endsWith("@guest.local")) {
    return NextResponse.json(
      {
        error:
          "Tu cuenta no tiene email válido para usar como customer de Wompi. Configurá un email real en /account.",
      },
      { status: 400 },
    );
  }

  // FLUJO NEQUI (special case): tokenizamos el teléfono y guardamos el
  // token_id en la row, pero NO creamos el payment_source todavía. El
  // payment_source solo se puede crear con un token APROBADO. El user
  // recibe el push, lo aprueba, y /check detecta la aprobación y crea
  // el source recién ahí.
  //
  // Antes creábamos el source inmediato con el token PENDING → el source
  // quedaba PENDING para siempre porque el token nunca llegó aprobado al
  // momento de crearse.
  if (body.type === "NEQUI") {
    let nequiTokenId: string;
    try {
      const tokenRes = await fetch(`${apiBase}/tokens/nequi`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // tokens/nequi usa PUBLIC key
          Authorization: `Bearer ${cfg.publicKey}`,
        },
        body: JSON.stringify({ phone_number: body.phoneNumber }),
      });
      const tokenJson = (await tokenRes.json()) as {
        data?: { id?: string; status?: string };
        error?: {
          type?: string;
          reason?: string;
          messages?: Record<string, string[]> | string;
        };
      };
      if (!tokenRes.ok || !tokenJson.data?.id) {
        let detail = "";
        if (
          tokenJson.error?.messages &&
          typeof tokenJson.error.messages === "object"
        ) {
          detail = Object.entries(tokenJson.error.messages)
            .map(([f, m]) => `${f}: ${Array.isArray(m) ? m.join(", ") : m}`)
            .join(" · ");
        }
        const errMsg =
          detail ||
          tokenJson.error?.reason ||
          `Wompi rechazó el teléfono (${tokenRes.status})`;
        console.warn("Wompi tokens/nequi rejected", {
          status: tokenRes.status,
          error: tokenJson.error,
        });
        return NextResponse.json({ error: errMsg }, { status: 400 });
      }
      nequiTokenId = tokenJson.data.id;
    } catch (err) {
      console.error("Wompi tokens/nequi network failed", err);
      return NextResponse.json(
        {
          error:
            "No pudimos contactar Wompi para tokenizar el teléfono. Probá de nuevo.",
        },
        { status: 502 },
      );
    }

    // Guardar la row con el token (sin source_id todavía).
    // Status TOKEN_PENDING es nuestro custom — Wompi usa "PENDING" pero
    // queremos diferenciar "esperando aprobación del token" de "source
    // pendiente". /check entiende ambos.
    await prisma.paymentMethod.updateMany({
      where: { subscriptionId: sub.id, isDefault: true },
      data: { isDefault: false },
    });
    const pm = await prisma.paymentMethod.create({
      data: {
        subscriptionId: sub.id,
        wompiSourceId: null,
        nequiTokenId,
        type: "NEQUI",
        isDefault: true,
        environment: env,
        wompiStatus: "TOKEN_PENDING",
        wompiStatusCheckedAt: new Date(),
        brand: "NEQUI",
        last4: body.phoneNumber.slice(-4),
        holderName: body.phoneNumber,
      },
    });

    audit({
      category: "billing",
      action: "payment_method.nequi_tokenized",
      actorUserId: user.id,
      actorEmail: user.email,
      targetId: pm.id,
      metadata: {
        agencyId: m.agencyId,
        last4: body.phoneNumber.slice(-4),
        environment: env,
      },
      req,
    });

    return NextResponse.json({
      ok: true,
      paymentMethodId: pm.id,
      wompiStatus: "TOKEN_PENDING",
      needsConfirmation: true,
      note: "Te llegó un push a tu app Nequi para confirmar. Aprobá ahí en los próximos 5 minutos para activarlo.",
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // FLUJO CARD: el token de tarjeta ya fue aprobado por el browser via
  // /tokens/cards (el user metió los datos directos a Wompi). Acá solo
  // creamos el payment_source con ese token.
  // ─────────────────────────────────────────────────────────────────
  const sourceBody: Record<string, unknown> = {
    type: "CARD",
    token: body.cardToken,
    customer_email: user.email,
    acceptance_token: acceptanceToken,
    ...(acceptancePersonalDataAuthToken && {
      accept_personal_auth: acceptancePersonalDataAuthToken,
    }),
  };

  // Llamar a Wompi para crear el payment_source.
  let sourceId: string | null = null;
  let sourceStatus: string | null = null;
  try {
    const res = await fetch(`${apiBase}/payment_sources`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.privateKey}`,
      },
      body: JSON.stringify(sourceBody),
    });
    const json = (await res.json()) as {
      data?: { id?: string | number; status?: string };
      error?: {
        type?: string;
        reason?: string;
        // messages es un objeto { field: ["error 1", "error 2"], ... }
        messages?: Record<string, string[]> | string;
      };
    };
    if (!res.ok || !json.data?.id) {
      // Wompi devuelve los errores granulares en error.messages como
      // { campo: ["mensaje"] }. Lo expandimos para que el user vea
      // exactamente qué falló (ej. "phone_number: formato inválido").
      let detail = "";
      if (json.error?.messages && typeof json.error.messages === "object") {
        const entries = Object.entries(json.error.messages);
        if (entries.length > 0) {
          detail = entries
            .map(([field, msgs]) => {
              const list = Array.isArray(msgs) ? msgs.join(", ") : String(msgs);
              return `${field}: ${list}`;
            })
            .join(" · ");
        }
      } else if (typeof json.error?.messages === "string") {
        detail = json.error.messages;
      }
      const errMsg =
        detail ||
        json.error?.reason ||
        json.error?.type ||
        `Wompi rechazó el método (${res.status})`;
      // Loggear server-side para debug; el user solo ve el detail
      console.warn("Wompi payment_source rejected", {
        type: body.type,
        status: res.status,
        error: json.error,
      });
      return NextResponse.json({ error: errMsg }, { status: 400 });
    }
    sourceId = String(json.data.id);
    // Wompi devuelve status: "AVAILABLE" para CARDs aprobadas, "PENDING"
    // para NEQUI hasta que el user confirma el push en su app. Lo
    // guardamos en la DB para que la UI muestre el estado correcto y el
    // polling sepa qué buscar.
    sourceStatus =
      typeof json.data.status === "string" ? json.data.status : null;
  } catch (err) {
    console.error("Wompi payment_source create failed", err);
    return NextResponse.json(
      {
        error:
          "Error al comunicarse con Wompi. Probá de nuevo o contactá soporte.",
      },
      { status: 502 },
    );
  }

  // Idempotencia: si por algún motivo este source ya existe en DB, no
  // duplicamos. Solo desmarcamos defaults previos y lo upserteamos.
  await prisma.paymentMethod.updateMany({
    where: { subscriptionId: sub.id, isDefault: true },
    data: { isDefault: false },
  });

  // NEQUI ya retornó antes — acá solo llega CARD.
  if (body.type !== "CARD") {
    return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
  }
  const pm = await prisma.paymentMethod.upsert({
    where: { wompiSourceId: sourceId },
    create: {
      subscriptionId: sub.id,
      wompiSourceId: sourceId,
      type: "CARD",
      isDefault: true,
      environment: env,
      wompiStatus: sourceStatus,
      wompiStatusCheckedAt: new Date(),
      brand: body.brand,
      last4: body.last4,
      expMonth: body.expMonth,
      expYear: body.expYear,
      holderName: body.cardHolder,
    },
    update: {
      subscriptionId: sub.id,
      isDefault: true,
      environment: env,
      wompiStatus: sourceStatus,
      wompiStatusCheckedAt: new Date(),
    },
  });

  audit({
    category: "billing",
    action: "payment_method.added",
    actorUserId: user.id,
    actorEmail: user.email,
    targetId: pm.id,
    metadata: {
      agencyId: m.agencyId,
      type: "CARD",
      brand: body.brand,
      last4: body.last4,
      environment: env,
    },
    req,
  });

  return NextResponse.json({
    ok: true,
    paymentMethodId: pm.id,
    wompiStatus: sourceStatus,
    needsConfirmation: false,
    note: "Tarjeta guardada correctamente.",
  });
}
