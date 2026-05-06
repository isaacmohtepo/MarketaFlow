/**
 * Fetch Instagram Insights para un media id publicado.
 *
 * Métricas disponibles para IG Business posts (v21):
 *   - impressions: veces que el post fue visto (deprecated en favor de "views")
 *   - reach: cuentas únicas que vieron el post
 *   - likes: cantidad de likes
 *   - comments: cantidad de comments
 *   - shares: veces compartido
 *   - saved: veces guardado
 *   - video_views: solo en video
 *
 * Devolvemos un objeto plano { metric: number } con lo que Meta haya devuelto.
 */
const META_BASE = "https://graph.facebook.com/v21.0";

const STANDARD_METRICS = [
  "reach",
  "likes",
  "comments",
  "shares",
  "saved",
] as const;

export async function fetchInstagramInsights(
  mediaId: string,
  accessToken: string,
): Promise<Record<string, number> | null> {
  try {
    const params = new URLSearchParams({
      metric: STANDARD_METRICS.join(","),
      access_token: accessToken,
    });
    const res = await fetch(
      `${META_BASE}/${encodeURIComponent(mediaId)}/insights?${params.toString()}`,
    );
    if (!res.ok) {
      console.error(
        "fetchInstagramInsights failed",
        res.status,
        await res.text().catch(() => ""),
      );
      return null;
    }
    const j = (await res.json()) as {
      data?: { name: string; values: { value: number }[] }[];
    };
    if (!j.data) return null;
    const out: Record<string, number> = {};
    for (const item of j.data) {
      const value = item.values?.[0]?.value;
      if (typeof value === "number") {
        out[item.name] = value;
      }
    }
    return out;
  } catch (err) {
    console.error("fetchInstagramInsights threw", err);
    return null;
  }
}
