import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser, hashPassword } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { audit } from "@/lib/audit";
import type { Prisma } from "@/generated/prisma";

/**
 * GET /api/admin/users
 *   ?q=<search>&role=<role>&status=<active|disabled>&page=1&pageSize=25
 *
 * POST /api/admin/users
 *   { email, name, password, role }
 *
 * Endpoints admin para listar y crear usuarios.
 */

const PAGE_SIZE_DEFAULT = 25;
const PAGE_SIZE_MAX = 100;

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!(await isAdmin(user.id))) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const role = url.searchParams.get("role");
  const status = url.searchParams.get("status");
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(
    PAGE_SIZE_MAX,
    Math.max(
      1,
      parseInt(url.searchParams.get("pageSize") ?? String(PAGE_SIZE_DEFAULT), 10) ||
        PAGE_SIZE_DEFAULT,
    ),
  );

  const where: Prisma.UserWhereInput = {};
  if (q) {
    where.OR = [
      { email: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
    ];
  }
  if (role && role !== "all") where.role = role;
  if (status === "disabled") where.disabledAt = { not: null };
  if (status === "active") where.disabledAt = null;

  const [items, totalCount] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        role: true,
        disabledAt: true,
        disabledReason: true,
        createdAt: true,
        passwordChangedAt: true,
        _count: {
          select: { memberships: true, sessions: true, comments: true },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return NextResponse.json({
    items,
    totalCount,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  });
}

const createSchema = z.object({
  email: z
    .string()
    .email()
    .max(254)
    .transform((s) => s.toLowerCase().trim()),
  name: z.string().min(1).max(120),
  // Password mínimo igual que en register
  password: z
    .string()
    .min(8)
    .max(120)
    .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), {
      message: "La contraseña debe combinar letras y números",
    }),
  role: z.enum(["agency", "client"]).default("agency"),
});

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!(await isAdmin(me.id))) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  let body;
  try {
    body = createSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email: body.email } });
  if (existing) {
    return NextResponse.json(
      { error: "Ya existe un usuario con ese email" },
      { status: 409 },
    );
  }

  const passwordHash = await hashPassword(body.password);
  const created = await prisma.user.create({
    data: {
      email: body.email,
      name: body.name,
      role: body.role,
      passwordHash,
    },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });

  audit({
    category: "admin",
    action: "user.created",
    actorUserId: me.id,
    actorEmail: me.email,
    targetId: created.id,
    metadata: { email: created.email, role: created.role },
    req,
  });

  return NextResponse.json({ user: created }, { status: 201 });
}
