/**
 * Helper para escribir al AuditLog. Cada operación sensible debería llamar
 * a `audit()` con la categoría + acción correspondiente.
 *
 * Convenciones de naming:
 * - category: "auth" | "billing" | "integrations" | "admin" | "team"
 * - action: dot-separated en pasado (ej. "role.changed", "subscription.canceled")
 *
 * No bloquea la respuesta — si el log falla, loggeamos error pero la
 * operación principal sigue. Compliance prefiere "intento" loggeado mal vs
 * acción que falla por log.
 */

import { prisma } from "./db";

export type AuditCategory =
  | "auth"
  | "billing"
  | "integrations"
  | "admin"
  | "team";

export type AuditEntry = {
  category: AuditCategory;
  action: string;
  actorUserId?: string | null;
  actorEmail?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  /** Si pasas el req, extraemos IP + UA automático */
  req?: Request;
};

export async function audit(entry: AuditEntry): Promise<void> {
  try {
    let ip: string | null = null;
    let userAgent: string | null = null;
    if (entry.req) {
      const fwd = entry.req.headers.get("x-forwarded-for");
      ip = fwd?.split(",")[0]?.trim() ?? null;
      userAgent = entry.req.headers.get("user-agent");
    }
    await prisma.auditLog.create({
      data: {
        category: entry.category,
        action: entry.action,
        actorUserId: entry.actorUserId ?? null,
        actorEmail: entry.actorEmail ?? null,
        targetId: entry.targetId ?? null,
        metadata: (entry.metadata as object | undefined) ?? undefined,
        ip,
        userAgent,
      },
    });
  } catch (err) {
    console.error("audit log failed", err, entry);
  }
}
