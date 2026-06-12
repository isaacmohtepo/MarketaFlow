/**
 * Helper para endpoints SSE con patrón "polling sobre stream".
 *
 * Mantiene el stream abierto y llama a `onPoll(send)` cada `intervalMs`. El
 * server cierra a `maxMs` (límite serverless de Vercel) y el cliente
 * (EventSource) reconecta solo. Maneja abort + el flag `closed`.
 *
 * Lo usan /api/events/notifications y /api/events/tasks — antes cada uno
 * repetía todo el scaffolding del ReadableStream.
 */

type SendFn = (event: string, data: unknown) => void;

export function pollingSSE(opts: {
  req: Request;
  intervalMs: number;
  maxMs: number;
  /** Se llama una vez al abrir, antes del primer poll (opcional). */
  onStart?: (send: SendFn) => void | Promise<void>;
  /** Se llama en cada tick. Haz tus queries y emite con `send`. */
  onPoll: (send: SendFn) => void | Promise<void>;
}): Response {
  const { req, intervalMs, maxMs, onStart, onPoll } = opts;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      let lastEventAt = Date.now();

      const send: SendFn = (event, data) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
          lastEventAt = Date.now();
        } catch {
          closed = true;
        }
      };

      try {
        await onStart?.(send);
      } catch (err) {
        console.error("SSE onStart error", err);
      }
      send("ready", { ok: true });

      const startTs = Date.now();
      const interval = setInterval(async () => {
        if (closed) {
          clearInterval(interval);
          return;
        }
        if (Date.now() - startTs > maxMs) {
          clearInterval(interval);
          send("bye", { reason: "max-duration" });
          try {
            controller.close();
          } catch {}
          closed = true;
          return;
        }
        try {
          await onPoll(send);
          // Keep-alive: solo si llevamos >15s sin emitir nada (antes era un
          // ping POR TICK — con 100 conexiones eran ~50 eventos/seg inútiles).
          // El ping mismo actualiza lastEventAt, así que en idle sale ~1 cada 15s.
          if (Date.now() - lastEventAt > 15_000) {
            send("ping", { t: Date.now() });
          }
        } catch (err) {
          console.error("SSE onPoll error", err);
        }
      }, intervalMs);

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
