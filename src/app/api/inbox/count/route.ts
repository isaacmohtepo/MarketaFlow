import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ count: 0 });

  const accessFilter = {
    deletedAt: null,
    brand: { agency: { members: { some: { userId: user.id } } } },
  } as const;

  const now = new Date();

  const [pending, changes, ready] = await Promise.all([
    prisma.post.count({ where: { ...accessFilter, status: "in_review" } }),
    prisma.post.count({ where: { ...accessFilter, status: "changes_requested" } }),
    prisma.post.count({
      where: {
        ...accessFilter,
        status: { in: ["approved", "scheduled"] },
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }],
        publishedAt: null,
      },
    }),
  ]);

  return NextResponse.json({ count: pending + changes + ready });
}
