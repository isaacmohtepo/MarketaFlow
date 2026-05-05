// Helpers y tipos seguros para client/server (sin importar prisma)

export type BrandKpis = {
  approvalRate: number | null;        // 7d, 0–100
  approvedDecisions: number;
  totalDecisions: number;
  avgApprovalHours: number | null;    // 30d
  avgSampleSize: number;
  publishedSparkline: number[];        // 7 days, oldest → newest
  publishedTotal: number;              // sum of sparkline
};

export function emptyKpis(): BrandKpis {
  return {
    approvalRate: null,
    approvedDecisions: 0,
    totalDecisions: 0,
    avgApprovalHours: null,
    avgSampleSize: 0,
    publishedSparkline: new Array(7).fill(0),
    publishedTotal: 0,
  };
}

export function formatHours(h: number) {
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 24) return `${h.toFixed(1)} h`;
  const days = h / 24;
  return `${days.toFixed(1)} d`;
}

export function approvalRateTone(rate: number | null): "good" | "warn" | "bad" | "neutral" {
  if (rate === null) return "neutral";
  if (rate >= 80) return "good";
  if (rate >= 50) return "warn";
  return "bad";
}
