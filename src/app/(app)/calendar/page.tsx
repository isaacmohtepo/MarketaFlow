import { redirect } from "next/navigation";
import { Calendar } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { listUserBrands } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import CalendarView from "./CalendarView";

/**
 * Calendar view — vista mensual de posts programados/aprobados con
 * drag & drop para reschedule.
 */
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; brand?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const today = new Date();
  // month en formato YYYY-MM, default mes actual
  const monthParam = sp.month ?? `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const [yearStr, monthStr] = monthParam.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1; // JS month 0-indexed
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 1);

  const brands = await listUserBrands(user.id);
  const brandIds = brands.map((b) => b.id);
  const filterBrand = sp.brand;

  if (brandIds.length === 0) {
    return (
      <div className="mx-auto max-w-3xl py-10 text-center">
        <Calendar className="mx-auto h-10 w-10 text-zinc-300" />
        <p className="mt-3 text-[14px] font-semibold text-zinc-900">
          Sin marcas todavía
        </p>
        <p className="mt-1 text-[12px] text-zinc-500">
          Creá una marca primero para ver el calendario.
        </p>
      </div>
    );
  }

  const posts = await prisma.post.findMany({
    where: {
      deletedAt: null,
      brandId: filterBrand ? filterBrand : { in: brandIds },
      scheduledAt: { gte: monthStart, lt: monthEnd },
    },
    select: {
      id: true,
      caption: true,
      status: true,
      scheduledAt: true,
      imageUrl: true,
      brandId: true,
      brand: { select: { name: true, color: true } },
    },
    orderBy: { scheduledAt: "asc" },
  });

  return (
    <div className="mx-auto max-w-7xl">
      <CalendarView
        year={year}
        month={month}
        brands={brands.map((b) => ({
          id: b.id,
          name: b.name,
          color: b.color,
        }))}
        posts={posts.map((p) => ({
          id: p.id,
          caption: p.caption ?? "",
          status: p.status,
          scheduledAt: p.scheduledAt!.toISOString(),
          imageUrl: p.imageUrl,
          brandId: p.brandId,
          brandName: p.brand.name,
          brandColor: p.brand.color ?? null,
        }))}
        filterBrand={filterBrand ?? null}
      />
    </div>
  );
}
