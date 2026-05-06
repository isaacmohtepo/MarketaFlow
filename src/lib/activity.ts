import { prisma } from "./db";

export type ActivityType =
  | "created"
  | "status_changed"
  | "version_uploaded"
  | "published"
  | "publish_failed"
  | "deleted"
  | "restored";

export async function recordActivity(opts: {
  postId: string;
  userId: string | null;
  type: ActivityType;
  meta?: Record<string, unknown>;
}) {
  try {
    await prisma.activity.create({
      data: {
        postId: opts.postId,
        userId: opts.userId,
        type: opts.type,
        meta: JSON.stringify(opts.meta ?? {}),
      },
    });
  } catch (err) {
    console.error("recordActivity failed", err);
  }
}

export type TimelineEvent = {
  id: string;
  type: string;
  createdAt: string;
  userName: string | null;
  meta: Record<string, unknown>;
};

/**
 * Carga la línea de tiempo de un post combinando:
 * - Activity (created, status_changed, published, version, deleted/restored)
 * - Approval (approved/changes_requested)
 * - Comment (con o sin pin)
 *
 * `excludeInternal` filtra los comentarios internos del equipo (cliente no debe verlos).
 */
export async function getPostTimeline(
  postId: string,
  opts?: { excludeInternal?: boolean },
): Promise<TimelineEvent[]> {
  const [activities, approvals, comments] = await Promise.all([
    prisma.activity.findMany({
      where: { postId },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.approval.findMany({
      where: { postId },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.comment.findMany({
      where: {
        postId,
        parentId: null,
        ...(opts?.excludeInternal ? { internal: false } : {}),
      },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
  ]);

  const events: TimelineEvent[] = [];

  for (const a of activities) {
    let meta: Record<string, unknown> = {};
    try {
      meta = JSON.parse(a.meta);
    } catch {}
    events.push({
      id: `a-${a.id}`,
      type: a.type,
      createdAt: a.createdAt.toISOString(),
      userName: a.user?.name ?? a.user?.email ?? null,
      meta,
    });
  }

  for (const ap of approvals) {
    events.push({
      id: `ap-${ap.id}`,
      type: ap.decision === "approved" ? "approved" : "changes_requested",
      createdAt: ap.createdAt.toISOString(),
      userName: ap.user.name ?? ap.user.email,
      meta: ap.note ? { note: ap.note } : {},
    });
  }

  for (const c of comments) {
    events.push({
      id: `c-${c.id}`,
      type: "commented",
      createdAt: c.createdAt.toISOString(),
      userName: c.user.name ?? c.user.email,
      meta: { body: c.body, pinned: c.x != null },
    });
  }

  events.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return events;
}
