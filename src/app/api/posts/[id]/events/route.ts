import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getPostAccess } from "@/lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const POLL_INTERVAL_MS = 2_000;
const MAX_CONNECTION_MS = 50_000; // serverless-friendly, EventSource reconectará

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const ctx = await getPostAccess(user.id, id);
  if (!ctx) return new Response("Forbidden", { status: 403 });

  const encoder = new TextEncoder();

  // Cursores para detectar cambios desde el handshake
  const initial = new Date();
  let createdCursor = initial; // comentarios nuevos
  let updatedCursor = initial; // comentarios editados/resueltos
  let lastStatus = ctx.post.status;
  let knownIds = new Set<string>();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;

      function safeEnqueue(chunk: Uint8Array) {
        if (closed) return;
        try {
          controller.enqueue(chunk);
        } catch {
          closed = true;
        }
      }

      function send(event: string, data: unknown) {
        safeEnqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      }

      // Snapshot inicial: enviamos los IDs ya presentes para que el cliente sepa cuáles ya tiene
      try {
        const existing = await prisma.comment.findMany({
          where: {
            postId: id,
            ...(ctx.access.role === "client" ? { internal: false } : {}),
          },
          select: { id: true },
        });
        knownIds = new Set(existing.map((c) => c.id));
      } catch {}
      send("ready", { ok: true, status: lastStatus });

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
          // 1) Cambio de estado del post
          const fresh = await prisma.post.findUnique({
            where: { id },
            select: { status: true, deletedAt: true },
          });
          if (fresh && fresh.status !== lastStatus) {
            lastStatus = fresh.status;
            send("status", { status: fresh.status });
          }

          // 2) Comentarios nuevos
          const created = await prisma.comment.findMany({
            where: {
              postId: id,
              createdAt: { gt: createdCursor },
              ...(ctx.access.role === "client" ? { internal: false } : {}),
            },
            include: {
              user: { select: { name: true, email: true } },
              assignedTo: { select: { id: true, name: true, email: true } },
            },
            orderBy: { createdAt: "asc" },
          });
          if (created.length > 0) {
            createdCursor = created[created.length - 1].createdAt;
            for (const c of created) {
              if (knownIds.has(c.id)) continue;
              knownIds.add(c.id);
              send("comment", {
                id: c.id,
                body: c.body,
                x: c.x,
                y: c.y,
                parentId: c.parentId,
                resolved: c.resolved,
                internal: c.internal,
                assignedToId: c.assignedToId,
                assignedToName: c.assignedTo?.name ?? c.assignedTo?.email ?? null,
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
              });
            }
          }

          // 3) Comentarios editados o resueltos (updatedAt > cursor & ya conocidos)
          const updated = await prisma.comment.findMany({
            where: {
              postId: id,
              updatedAt: { gt: updatedCursor },
              createdAt: { lte: createdCursor }, // evita duplicar con los recién creados
              ...(ctx.access.role === "client" ? { internal: false } : {}),
            },
            include: {
              user: { select: { name: true, email: true } },
              assignedTo: { select: { id: true, name: true, email: true } },
            },
            orderBy: { updatedAt: "asc" },
          });
          if (updated.length > 0) {
            updatedCursor = updated[updated.length - 1].updatedAt;
            for (const c of updated) {
              send("comment_update", {
                id: c.id,
                body: c.body,
                resolved: c.resolved,
                internal: c.internal,
                assignedToId: c.assignedToId,
                assignedToName: c.assignedTo?.name ?? c.assignedTo?.email ?? null,
                selector: c.selector,
                x: c.x,
                y: c.y,
                scrollY: c.scrollY,
                viewportW: c.viewportW,
                viewportH: c.viewportH,
                updatedAt: c.updatedAt.toISOString(),
              });
            }
          }

          // Heartbeat — útil para que proxies no maten la conexión
          send("ping", { t: Date.now() });
        } catch (err) {
          console.error("SSE poll error", err);
        }
      }, POLL_INTERVAL_MS);

      // Si el cliente cierra la conexión limpiamos el interval
      const onAbort = () => {
        closed = true;
        clearInterval(interval);
        try {
          controller.close();
        } catch {}
      };
      // _req.signal está disponible y dispara onAbort en disconnect
      try {
        _req.signal?.addEventListener("abort", onAbort);
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
