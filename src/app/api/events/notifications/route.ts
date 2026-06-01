import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { pollingSSE } from "@/lib/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const POLL_INTERVAL_MS = 2_000;
const MAX_CONNECTION_MS = 50_000;

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  let cursor = new Date();
  const knownIds = new Set<string>();

  return pollingSSE({
    req,
    intervalMs: POLL_INTERVAL_MS,
    maxMs: MAX_CONNECTION_MS,
    onStart: async () => {
      // Snapshot inicial: capturamos los IDs conocidos para no re-emitirlos.
      try {
        const recent = await prisma.notification.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: "desc" },
          take: 50,
          select: { id: true },
        });
        recent.forEach((n) => knownIds.add(n.id));
      } catch {}
    },
    onPoll: async (send) => {
      const fresh = await prisma.notification.findMany({
        where: { userId: user.id, createdAt: { gt: cursor } },
        orderBy: { createdAt: "asc" },
      });
      if (fresh.length === 0) return;
      cursor = fresh[fresh.length - 1].createdAt;
      for (const n of fresh) {
        if (knownIds.has(n.id)) continue;
        knownIds.add(n.id);
        send("notification", {
          id: n.id,
          type: n.type,
          body: n.body,
          brandId: n.brandId,
          postId: n.postId,
          taskId: n.taskId,
          actorName: n.actorName,
          read: n.read,
          createdAt: n.createdAt.toISOString(),
        });
      }
    },
  });
}
