import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasAgencyPermission } from "@/lib/permissions";
import { getUserTaskAgency } from "@/lib/tasks";

/**
 * GET /api/task-tags — lista las tags de la agency del user.
 * POST /api/task-tags { name, color? } — crea una nueva.
 *
 * Permisos: requiere tasks.read para GET, tasks.write para POST.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const agency = await getUserTaskAgency(user.id);
  if (!agency)
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  const canRead = await hasAgencyPermission(user.id, agency.agencyId, "tasks.read");
  if (!canRead)
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  const tags = await prisma.taskTag.findMany({
    where: { agencyId: agency.agencyId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, color: true },
  });
  return NextResponse.json({ tags });
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z
    .string()
    .regex(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
    .optional(),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const agency = await getUserTaskAgency(user.id);
  if (!agency)
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  const canWrite = await hasAgencyPermission(user.id, agency.agencyId, "tasks.write");
  if (!canWrite)
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  let body;
  try {
    body = createSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  // Normalizar nombre (case-insensitive dedup) + capitalizar primera letra
  // para display consistente.
  const name = body.name.trim().replace(/\s+/g, " ");

  try {
    const tag = await prisma.taskTag.create({
      data: {
        agencyId: agency.agencyId,
        name,
        color: body.color ?? "#71717a",
      },
      select: { id: true, name: true, color: true },
    });
    return NextResponse.json({ tag });
  } catch (err) {
    // Unique violation por nombre duplicado en esta agency
    const e = err as { code?: string };
    if (e.code === "P2002") {
      return NextResponse.json(
        { error: "Ya existe una etiqueta con ese nombre" },
        { status: 409 },
      );
    }
    throw err;
  }
}
