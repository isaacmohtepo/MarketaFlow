import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const POLL_INTERVAL_MS = 2_000;
const MAX_CONNECTION_MS = 50_000;

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const encoder = new TextEncoder();
  let cursor = new Date();
  const knownIds = new Set<string>();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;

      function send(event: string, data: unknown) {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          closed = true;
        }
      }

      // Snapshot inicial: capturamos los IDs conocidos para no re-emitirlos
      try {
        const recent = await prisma.notification.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: "desc" },
          take: 50,
          select: { id: true },
        });
        recent.forEach((n) => knownIds.add(n.id));
      } catch {}

      send("ready", { ok: true });

      const startTs = Date.now();
      const interval = setInterval(async () => {
        if (closed) {
          clearInterval(interval);
          return;
        }
        if (Date.now() - startTs > MAX_CONNECTION_MS) {
          clearInterval(interval);
          send("bye", { reason: "max-duration" });
          try {
            controller.close();
          } catch {}
          closed = true;
          return;
        }
        try {
          const fresh = await prisma.notification.findMany({
            where: { userId: user.id, createdAt: { gt: cursor } },
            orderBy: { createdAt: "asc" },
          });
          if (fresh.length > 0) {
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
                actorName: n.actorName,
                read: n.read,
                createdAt: n.createdAt.toISOString(),
              });
            }
          }
          send("ping", { t: Date.now() });
        } catch (err) {
          console.error("notif SSE poll error", err);
        }
      }, POLL_INTERVAL_MS);

      const onAbort = () => {
        closed = true;
        clearInterval(interval);
        try {
          controller.close();
        } catch {}
      };
      try {
        req.signal?.addEventListener("abort", onAbort);
      } catch {}
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
