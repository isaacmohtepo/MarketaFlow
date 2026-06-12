import { prisma } from "./db";
import { sendEmail, appUrl } from "./email";
import { permissionsForRole } from "./permissions";
import {
  tplPostInReview,
  tplPostApproved,
  tplChangesRequested,
  tplPostPublished,
  tplCommentMention,
} from "./email-templates";

type NotifType =
  | "post_in_review"
  | "post_approved"
  | "post_changes_requested"
  | "post_published"
  | "post_publish_failed"
  | "comment_mention";

async function buildEmail(opts: {
  type: string;
  brandId: string;
  postId: string;
  actorName: string;
  body: string;
}): Promise<{ subject: string; html: string } | null> {
  const brand = await prisma.brand.findUnique({
    where: { id: opts.brandId },
    include: { agency: true },
  });
  if (!brand) return null;
  const post = await prisma.post.findUnique({ where: { id: opts.postId } });
  const postUrl = appUrl(`/brands/${opts.brandId}/posts/${opts.postId}`);

  // Branding white-label de la agency (si está activo). null = usar default
  // de MarketaFlow.
  const { getWhiteLabel } = await import("./white-label");
  const wlRaw = await getWhiteLabel(brand.agencyId);
  const wl = wlRaw.enabled
    ? {
        brandName: wlRaw.brandName,
        logoUrl: wlRaw.logoUrl,
        accentColor: wlRaw.accentColor,
      }
    : null;

  switch (opts.type as NotifType) {
    case "post_in_review":
      return {
        subject: `${brand.name}: post para tu revisión`,
        html: tplPostInReview({
          brandName: brand.name,
          agencyName: brand.agency.name,
          actorName: opts.actorName,
          postUrl,
          caption: post?.caption,
          wl,
        }),
      };
    case "post_approved":
      return {
        subject: `${brand.name}: post aprobado por ${opts.actorName}`,
        html: tplPostApproved({
          brandName: brand.name,
          clientName: opts.actorName,
          postUrl,
          wl,
        }),
      };
    case "post_changes_requested": {
      // body trae la nota: 'El cliente solicitó cambios: "..."'
      const noteMatch = opts.body.match(/"([^"]+)"/);
      return {
        subject: `${brand.name}: ${opts.actorName} pidió cambios`,
        html: tplChangesRequested({
          brandName: brand.name,
          clientName: opts.actorName,
          note: noteMatch?.[1] ?? null,
          postUrl,
          wl,
        }),
      };
    }
    case "post_published":
      return {
        subject: `${brand.name}: post publicado`,
        html: tplPostPublished({
          brandName: brand.name,
          postUrl,
          publishedUrl: post?.publishedUrl ?? null,
        }),
      };
    case "comment_mention":
      return {
        subject: `${opts.actorName} te mencionó en ${brand.name}`,
        html: tplCommentMention({
          brandName: brand.name,
          actorName: opts.actorName,
          body: opts.body,
          postUrl,
        }),
      };
    default:
      return null;
  }
}

async function dispatchEmails(
  userIds: string[],
  opts: { type: string; brandId: string; postId: string; actorName: string; body: string },
) {
  if (userIds.length === 0) return;
  const recipients = await prisma.user.findMany({
    where: { id: { in: userIds }, emailNotifications: true },
    select: { email: true },
  });
  if (recipients.length === 0) return;
  const built = await buildEmail(opts);
  if (!built) return;
  await Promise.all(
    recipients.map((r) =>
      sendEmail({ to: r.email, subject: built.subject, html: built.html }),
    ),
  );
}

export async function notifyBrandClients(opts: {
  brandId: string;
  postId: string;
  type: string;
  body: string;
  actorName: string;
  actorAvatarUrl?: string | null;
  // Si el actor también está en este pool (raro pero posible si un user
  // tiene rol "client" en su propia brand), lo excluimos para que no se
  // mande notificaciones a sí mismo.
  excludeUserId?: string;
}) {
  const clients = await prisma.membership.findMany({
    where: { brandId: opts.brandId, role: "client" },
    select: { userId: true },
  });
  if (clients.length === 0) return;
  const userIds = clients
    .map((c) => c.userId)
    .filter((id) => id !== opts.excludeUserId);
  if (userIds.length === 0) return;
  await prisma.notification.createMany({
    data: userIds.map((userId) => ({
      userId,
      type: opts.type,
      body: opts.body,
      brandId: opts.brandId,
      postId: opts.postId,
      actorName: opts.actorName,
      actorAvatarUrl: opts.actorAvatarUrl ?? null,
    })),
  });
  // Email fire-and-forget
  dispatchEmails(userIds, opts).catch((err) => console.error("dispatchEmails", err));
}

/**
 * Crea notificación in-app + dispara email para los usuarios mencionados con @ en un comentario.
 */
export async function notifyMentionedUsers(opts: {
  userIds: string[];
  brandId: string;
  postId: string;
  body: string;
  actorName: string;
  actorAvatarUrl?: string | null;
  // Defensa por si el caller no filtró: nunca notificar al propio actor.
  excludeUserId?: string;
}) {
  const userIds = opts.userIds.filter((id) => id !== opts.excludeUserId);
  if (userIds.length === 0) return;
  await prisma.notification.createMany({
    data: userIds.map((userId) => ({
      userId,
      type: "comment_mention",
      body: `${opts.actorName} te mencionó: "${opts.body.slice(0, 120)}"`,
      brandId: opts.brandId,
      postId: opts.postId,
      actorName: opts.actorName,
      actorAvatarUrl: opts.actorAvatarUrl ?? null,
    })),
  });
  dispatchEmails(userIds, {
    type: "comment_mention",
    brandId: opts.brandId,
    postId: opts.postId,
    actorName: opts.actorName,
    body: opts.body,
  }).catch((err) => console.error("dispatchEmails (mention)", err));
}

/**
 * Notifica a los miembros de la agencia que pueden hacer aprobación interna
 * (permiso `posts.approve_internal`) que hay un post esperando su revisión
 * antes de mverselo al cliente.
 */
export async function notifyAgencyForInternalReview(opts: {
  brandId: string;
  postId: string;
  actorName: string;
  actorAvatarUrl?: string | null;
  excludeUserId?: string;
}) {
  const brand = await prisma.brand.findUnique({
    where: { id: opts.brandId },
    include: { agency: true },
  });
  if (!brand) return;

  // Memberships agency-level (brandId null) — los que tienen scope global.
  const memberships = await prisma.membership.findMany({
    where: { agencyId: brand.agencyId, brandId: null },
    select: { userId: true, role: true },
  });

  // Resolvemos los permisos por ROL DISTINTO (no por miembro): con 50
  // miembros y 4 roles, son 4 lookups (cacheados) en vez de 50.
  const distinctRoles = [...new Set(memberships.map((m) => m.role))];
  const allowedRoles = new Set<string>();
  for (const slug of distinctRoles) {
    const perms = await permissionsForRole(brand.agencyId, slug);
    if (perms.includes("posts.approve_internal")) allowedRoles.add(slug);
  }
  const eligible = memberships
    .filter(
      (m) =>
        allowedRoles.has(m.role) &&
        (!opts.excludeUserId || m.userId !== opts.excludeUserId),
    )
    .map((m) => m.userId);
  if (eligible.length === 0) return;

  const body = "Hay un post listo para tu aprobación interna";
  await prisma.notification.createMany({
    data: eligible.map((userId) => ({
      userId,
      type: "post_internal_review",
      body,
      brandId: opts.brandId,
      postId: opts.postId,
      actorName: opts.actorName,
      actorAvatarUrl: opts.actorAvatarUrl ?? null,
    })),
  });

  // Email fire-and-forget — usamos el mismo subject/html base que post_in_review
  // para no inflar templates; la notif in-app ya transmite la diferencia.
  const recipients = await prisma.user.findMany({
    where: { id: { in: eligible }, emailNotifications: true },
    select: { email: true },
  });
  if (recipients.length === 0) return;
  const postUrl = appUrl(`/brands/${opts.brandId}/posts/${opts.postId}`);
  const subject = `${brand.name}: post para tu aprobación interna`;
  const html = `<p>${opts.actorName} dejó un post de <strong>${brand.name}</strong> listo para tu aprobación interna antes de enviarlo al cliente.</p><p><a href="${postUrl}">Abrir post</a></p>`;
  Promise.all(
    recipients.map((r) => sendEmail({ to: r.email, subject, html })),
  ).catch((err) => console.error("dispatchEmails (internal_review)", err));
}

export async function notifyBrandAgency(opts: {
  brandId: string;
  postId?: string;
  type: string;
  body: string;
  actorName: string;
  actorAvatarUrl?: string | null;
  excludeUserId?: string;
}) {
  const brand = await prisma.brand.findUnique({ where: { id: opts.brandId } });
  if (!brand) return;
  const agencyMembers = await prisma.membership.findMany({
    where: {
      agencyId: brand.agencyId,
      role: { in: ["owner", "editor"] },
      brandId: null,
    },
    select: { userId: true },
  });
  const targets = agencyMembers
    .map((m) => m.userId)
    .filter((id) => id !== opts.excludeUserId);
  if (targets.length === 0) return;
  await prisma.notification.createMany({
    data: targets.map((userId) => ({
      userId,
      type: opts.type,
      body: opts.body,
      brandId: opts.brandId,
      postId: opts.postId || null,
      actorName: opts.actorName,
      actorAvatarUrl: opts.actorAvatarUrl ?? null,
    })),
  });
  dispatchEmails(targets, { ...opts, postId: opts.postId ?? "" }).catch((err) =>
    console.error("dispatchEmails", err),
  );
}
