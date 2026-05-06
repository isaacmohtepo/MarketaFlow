import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getBrandAccess, hasPermission } from "@/lib/permissions";
import {
  parseBreakpoints,
  validateBreakpoints,
  type Breakpoints,
} from "@/lib/breakpoints";

/**
 * PATCH /api/brands/[id]/breakpoints
 * Actualiza los 5 breakpoints responsive de una marca. Solo owner/editor.
 *
 * Pasar `null` o body vacío resetea a defaults.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const access = await getBrandAccess(user.id, id);
  if (!access) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }
  const ok = await hasPermission(user.id, access.agencyId, "brands.edit", id);
  if (!ok) {
    return NextResponse.json({ error: "Sin permiso: brands.edit" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);

  if (body === null || body === undefined) {
    // Reset a defaults: usamos el JsonNull marker de Prisma para escribir
    // SQL NULL en la columna JSON.
    await prisma.brand.update({
      where: { id },
      data: { breakpoints: { set: null } } as never,
    });
    return NextResponse.json({ ok: true, breakpoints: null });
  }

  const parsed: Breakpoints = parseBreakpoints(body);
  const err = validateBreakpoints(parsed);
  if (err) {
    return NextResponse.json({ error: err }, { status: 400 });
  }

  await prisma.brand.update({
    where: { id },
    data: { breakpoints: parsed as unknown as object },
  });
  return NextResponse.json({ ok: true, breakpoints: parsed });
}
