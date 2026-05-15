"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Auto-refresh client de la página /billing/return cuando el invoice
 * sigue en "pending". Cada `intervalSec` segundos llama a router.refresh()
 * para que la server page reconsulte el invoice + haga el fallback
 * directo contra Wompi.
 *
 * Para de pollear después de `maxAttempts` intentos (~3-5 minutos) para
 * no quemar requests si Wompi nunca confirma. El user puede refrescar
 * manualmente si quiere seguir esperando.
 */
export default function PendingPoller({
  intervalSec = 4,
  maxAttempts = 60,
}: {
  intervalSec?: number;
  maxAttempts?: number;
}) {
  const router = useRouter();
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (attempts >= maxAttempts) return;
    const t = setTimeout(() => {
      router.refresh();
      setAttempts((a) => a + 1);
    }, intervalSec * 1000);
    return () => clearTimeout(t);
  }, [attempts, intervalSec, maxAttempts, router]);

  const elapsedSec = attempts * intervalSec;
  if (attempts >= maxAttempts) {
    return (
      <p className="mt-3 text-[11px] text-zinc-400">
        Llevamos {Math.round(elapsedSec / 60)} minutos esperando confirmación.
        Refrescá la página manualmente o contactá soporte si pasaron más de 10
        minutos.
      </p>
    );
  }
  return (
    <p className="mt-3 text-[11px] text-zinc-400">
      Verificando automáticamente cada {intervalSec}s
      {attempts > 0 ? ` · intento ${attempts}/${maxAttempts}` : ""}
    </p>
  );
}
