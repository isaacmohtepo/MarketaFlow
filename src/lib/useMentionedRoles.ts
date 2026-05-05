"use client";

import { useEffect, useMemo, useState } from "react";

type Member = { handle: string; role: string };

/**
 * Carga los miembros de la brand una vez y detecta si el body de un comment
 * tiene @menciones de un usuario con rol "client".
 *
 * Útil para decisiones tipo "no permitir marcar como interno si el cliente
 * está mencionado".
 */
export function useMentionedRoles(brandId: string, body: string) {
  const [members, setMembers] = useState<Member[]>([]);

  useEffect(() => {
    if (!brandId) return;
    let cancelled = false;
    fetch(`/api/brands/${brandId}/mentionables?all=1`)
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((j) => {
        if (cancelled) return;
        setMembers(
          (j.users ?? []).map((u: { handle: string; role: string }) => ({
            handle: (u.handle ?? "").toLowerCase(),
            role: u.role,
          })),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [brandId]);

  const hasClientMention = useMemo(() => {
    if (!body) return false;
    const matches = body.match(/@([\w.\-áéíóúñÁÉÍÓÚÑ]+)/g) ?? [];
    const handles = matches.map((m) => m.slice(1).toLowerCase());
    if (handles.length === 0) return false;
    return handles.some((h) =>
      members.some((m) => m.handle === h && m.role === "client"),
    );
  }, [body, members]);

  return { hasClientMention };
}
