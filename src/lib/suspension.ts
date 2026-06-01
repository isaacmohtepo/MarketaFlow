/**
 * Helpers para hacer cumplir el flag `Agency.suspendedAt`.
 *
 * Filosofía: una agency suspendida queda en READ-ONLY para todo. Los users
 * pueden seguir logueando y viendo, pero no crear/editar/borrar nada
 * relacionado con la agency. Excepción: el owner sigue pudiendo acceder
 * a /billing y /admin/integrations para resolver la causa de la suspensión
 * (ej. cargar un nuevo método de pago).
 *
 * Uso típico en handlers POST/PATCH/DELETE:
 *
 *   const guard = await assertAgencyNotSuspended(agencyId);
 *   if (!guard.ok) return guard.response;
 *
 * O via brandId:
 *
 *   const guard = await assertBrandNotSuspended(brandId);
 *   if (!guard.ok) return guard.response;
 */

import { NextResponse } from "next/server";
import { prisma } from "./db";

type Guard =
  | { ok: true }
  | { ok: false; response: NextResponse };

const SUSPENDED_RESPONSE_BODY = {
  error:
    "Esta agencia está suspendida — modo solo-lectura. Si eres el owner, ve a /billing para resolver.",
  suspended: true,
};

export async function assertAgencyNotSuspended(agencyId: string): Promise<Guard> {
  const agency = await prisma.agency.findUnique({
    where: { id: agencyId },
    select: { suspendedAt: true },
  });
  if (!agency) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Agencia no encontrada" }, { status: 404 }),
    };
  }
  if (agency.suspendedAt) {
    return {
      ok: false,
      response: NextResponse.json(SUSPENDED_RESPONSE_BODY, { status: 423 }), // 423 Locked
    };
  }
  return { ok: true };
}

export async function assertBrandNotSuspended(brandId: string): Promise<Guard> {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { agency: { select: { suspendedAt: true } } },
  });
  if (!brand) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Marca no encontrada" }, { status: 404 }),
    };
  }
  if (brand.agency.suspendedAt) {
    return {
      ok: false,
      response: NextResponse.json(SUSPENDED_RESPONSE_BODY, { status: 423 }),
    };
  }
  return { ok: true };
}

export async function assertPostNotSuspended(postId: string): Promise<Guard> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: {
      brand: { select: { agency: { select: { suspendedAt: true } } } },
    },
  });
  if (!post) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Post no encontrado" }, { status: 404 }),
    };
  }
  if (post.brand.agency.suspendedAt) {
    return {
      ok: false,
      response: NextResponse.json(SUSPENDED_RESPONSE_BODY, { status: 423 }),
    };
  }
  return { ok: true };
}

/**
 * Para Server Components: lookup directo del flag por agencyId. No tira
 * response — solo boolean para que el page muestre banner.
 */
export async function isAgencySuspended(agencyId: string): Promise<boolean> {
  const a = await prisma.agency.findUnique({
    where: { id: agencyId },
    select: { suspendedAt: true },
  });
  return !!a?.suspendedAt;
}
