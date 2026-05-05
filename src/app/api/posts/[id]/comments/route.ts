import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getPostAccess } from "@/lib/permissions";
import {
  notifyBrandAgency,
  notifyBrandClients,
  notifyMentionedUsers,
} from "@/lib/notifications";
import { recordActivity } from "@/lib/activity";
import { invalidateBrandKpis } from "@/lib/kpis";

function extractMentions(text: string): string[] {
  // Captura @nombre con espacios (@"Maria Lopez") o @maria
  const matches = text.match(/@(?:"[^"]+"|[\w.\-áéíóúñÁÉÍÓÚÑ]+)/g) ?? [];
  return matches.map((m) => m.slice(1).replace(/^"|"$/g, "").trim().toLowerCase());
}

async function resolveMentionedUsers(opts: {
  brandId: string;
  authorId: string;
  body: string;
}): Promise<string[]> {
  const mentions = extractMentions(opts.body);
  if (mentions.length === 0) return [];

  // Pool: usuarios con membresía directa a la marca + agency-side de la agencia dueña
  const members = await prisma.membership.findMany({
    where: {
      OR: [{ brandId: opts.brandId }, { agency: { brands: { some: { id: opts.brandId } } } }],
    },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  const userPool = new Map<string, { id: string; name: string | null; email: string }>();
  for (const m of members) {
    const email = m.user.email.toLowerCase();
    if (email.endsWith("@guest.local") || email.startsWith("widget_")) continue;
    if (!userPool.has(m.user.id)) userPool.set(m.user.id, m.user);
  }

  const matched = new Set<string>();
  for (const m of mentions) {
    for (const u of userPool.values()) {
      if (u.id === opts.authorId) continue; // no auto-mención
      const candidates = [u.name?.toLowerCase(), u.email.toLowerCase().split("@")[0]].filter(
        Boolean,
      ) as string[];
      if (candidates.some((c) => c === m || c.startsWith(m))) {
        matched.add(u.id);
      }
    }
  }
  return Array.from(matched);
}

const schema = z.object({
  body: z.string().min(1),
  x: z.number().min(0).max(1).optional(),
  y: z.number().min(0).max(1).optional(),
  parentId: z.string().optional(),
  internal: z.boolean().optional(),
  attachmentUrl: z.string().url().nullable().optional(),
  attachmentName: z.string().max(200).nullable().optional(),
  attachmentMime: z.string().max(100).nullable().optional(),
  // Live mode (sin screenshot — el iframe siempre se ve en vivo)
  pageUrl: z.string().url().optional(),
  selector: z.string().max(500).optional(),
  viewportW: z.number().int().positive().optional(),
  viewportH: z.number().int().positive().optional(),
  scrollY: z.number().int().nonnegative().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const ctx = await getPostAccess(user.id, id);
  if (!ctx) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  let body;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  // Si es respuesta, ignoramos x/y (heredan del padre)
  const isReply = !!body.parentId;
  if (isReply) {
    const parent = await prisma.comment.findUnique({ where: { id: body.parentId } });
    if (!parent || parent.postId !== id) {
      return NextResponse.json({ error: "Comentario padre inválido" }, { status: 400 });
    }
  }

  // Calcular si el comment es interno
  // - Cliente NUNCA puede crear interno (lo ignoramos si lo manda).
  // - Agencia: usa lo que vino, o por default si post.status === "draft" lo hace interno.
  // - Si es reply, hereda el flag del parent (no se mezclan internos con públicos en un thread).
  let isInternal = false;
  if (ctx.access.role !== "client") {
    if (isReply) {
      const parent = await prisma.comment.findUnique({
        where: { id: body.parentId },
        select: { internal: true },
      });
      isInternal = parent?.internal ?? false;
    } else {
      isInternal = body.internal ?? ctx.post.status === "draft";
    }
  }

  const comment = await prisma.comment.create({
    data: {
      postId: id,
      userId: user.id,
      body: body.body,
      x: isReply ? null : body.x ?? null,
      y: isReply ? null : body.y ?? null,
      parentId: body.parentId ?? null,
      internal: isInternal,
      attachmentUrl: body.attachmentUrl ?? null,
      attachmentName: body.attachmentName ?? null,
      attachmentMime: body.attachmentMime ?? null,
      pageUrl: !isReply ? body.pageUrl ?? null : null,
      selector: !isReply ? body.selector ?? null : null,
      viewportW: !isReply ? body.viewportW ?? null : null,
      viewportH: !isReply ? body.viewportH ?? null : null,
      scrollY: !isReply ? body.scrollY ?? null : null,
    },
    include: { user: true },
  });

  // Procesar @menciones (fire-and-forget, no debe bloquear la respuesta)
  resolveMentionedUsers({
    brandId: ctx.post.brandId,
    authorId: user.id,
    body: body.body,
  })
    .then((userIds) =>
      notifyMentionedUsers({
        userIds,
        brandId: ctx.post.brandId,
        postId: id,
        body: body.body,
        actorName: user.name ?? user.email,
      }),
    )
    .catch((err) => console.error("notifyMentions failed", err));

  // Si el cliente comenta sobre un post "en revisión", se interpreta como pedido de cambios.
  // Mueve el post a "changes_requested" y avisa a la agencia.
  let autoStatusChange: { from: string; to: string } | null = null;
  if (
    ctx.access.role === "client" &&
    ctx.post.status === "in_review" &&
    !ctx.post.deletedAt
  ) {
    autoStatusChange = { from: ctx.post.status, to: "changes_requested" };
    await prisma.$transaction([
      prisma.post.update({
        where: { id },
        data: { status: "changes_requested" },
      }),
      prisma.approval.create({
        data: {
          postId: id,
          userId: user.id,
          decision: "changes_requested",
          note: body.body.slice(0, 500),
        },
      }),
    ]);
    recordActivity({
      postId: id,
      userId: user.id,
      type: "status_changed",
      meta: autoStatusChange,
    }).catch((err) => console.error("recordActivity failed", err));
    notifyBrandAgency({
      brandId: ctx.post.brandId,
      postId: id,
      type: "post_changes_requested",
      body: `El cliente solicitó cambios: "${body.body.slice(0, 120)}"`,
      actorName: user.name ?? user.email,
    }).catch((err) => console.error("notifyBrandAgency failed", err));
    invalidateBrandKpis(ctx.post.brandId);
  }

  // Notificación por comentario nuevo: si NO disparó el autoStatusChange (que ya
  // mandó notif a la agencia), notificamos al "otro lado" según quién comentó.
  // Cliente → agencia se entera. Agencia → clientes se enteran.
  if (!autoStatusChange) {
    const actorName = user.name ?? user.email;
    const preview = body.body.slice(0, 120);
    if (ctx.access.role === "client") {
      notifyBrandAgency({
        brandId: ctx.post.brandId,
        postId: id,
        type: isReply ? "comment_reply_from_client" : "comment_new_from_client",
        body: `${actorName}: "${preview}"`,
        actorName,
        excludeUserId: user.id,
      }).catch((err) => console.error("notifyBrandAgency (comment) failed", err));
    } else if (ctx.post.status !== "draft" && !isInternal) {
      // La agencia comentó público. Notificamos a clientes solo si el post es visible
      // y el comment no es interno (los internos no se notifican al cliente).
      notifyBrandClients({
        brandId: ctx.post.brandId,
        postId: id,
        type: isReply ? "comment_reply_from_agency" : "comment_new_from_agency",
        body: `${actorName}: "${preview}"`,
        actorName,
      }).catch((err) => console.error("notifyBrandClients (comment) failed", err));
    }
  }

  return NextResponse.json({
    comment: serialize(comment),
    autoStatusChange,
  });
}

function serialize(c: {
  id: string;
  body: string;
  x: number | null;
  y: number | null;
  parentId: string | null;
  resolved: boolean;
  internal: boolean;
  attachmentUrl: string | null;
  attachmentName: string | null;
  attachmentMime: string | null;
  pageUrl: string | null;
  selector: string | null;
  viewportW: number | null;
  viewportH: number | null;
  scrollY: number | null;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  user: { name: string | null; email: string };
}) {
  return {
    id: c.id,
    body: c.body,
    x: c.x,
    y: c.y,
    parentId: c.parentId,
    resolved: c.resolved,
    internal: c.internal,
    attachmentUrl: c.attachmentUrl,
    attachmentName: c.attachmentName,
    attachmentMime: c.attachmentMime,
    pageUrl: c.pageUrl,
    selector: c.selector,
    viewportW: c.viewportW,
    viewportH: c.viewportH,
    scrollY: c.scrollY,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    userId: c.userId,
    userName: c.user.name ?? c.user.email,
  };
}
