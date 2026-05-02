import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, Trash2, ImageOff } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getBrandAccess } from "@/lib/permissions";
import { getUserAgencyName } from "@/lib/agency";
import { prisma } from "@/lib/db";
import AppShell from "@/components/AppShell";
import { STATUS_COLOR, STATUS_LABEL } from "@/lib/utils";
import TrashRow from "./TrashRow";

const MONTHS = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
function fmt(d: Date) {
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export default async function TrashPage({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const access = await getBrandAccess(user.id, brandId);
  if (!access || !access.canEdit) notFound();

  const [brand, agencyName, posts] = await Promise.all([
    prisma.brand.findUnique({ where: { id: brandId } }),
    getUserAgencyName(user.id),
    prisma.post.findMany({
      where: { brandId, deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
    }),
  ]);
  if (!brand) notFound();

  return (
    <AppShell
      userName={user.name ?? user.email}
      agencyName={agencyName}
      title={`${brand.name} · Papelera`}
    >
      <div className="mx-auto max-w-3xl">
        <Link
          href={`/brands/${brandId}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-900"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Volver al feed
        </Link>
        <div className="mt-3 flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-zinc-100">
            <Trash2 className="h-4 w-4 text-zinc-600" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Papelera</h1>
            <p className="text-[12px] text-zinc-500">
              {posts.length} {posts.length === 1 ? "post" : "posts"} en la papelera
            </p>
          </div>
        </div>

        {posts.length === 0 ? (
          <div className="card mt-6 flex flex-col items-center gap-2 p-12 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-blue-50 via-fuchsia-50 to-rose-50">
              <Trash2 className="h-5 w-5 text-zinc-400" />
            </span>
            <p className="text-[14px] font-semibold text-zinc-900">Papelera vacía</p>
            <p className="text-[12px] text-zinc-500">
              Los posts que muevas a la papelera aparecerán aquí.
            </p>
          </div>
        ) : (
          <ul className="card mt-6 divide-y divider overflow-hidden">
            {posts.map((p) => (
              <TrashRow
                key={p.id}
                post={{
                  id: p.id,
                  imageUrl: p.imageUrl,
                  caption: p.caption,
                  status: p.status,
                  statusLabel: STATUS_LABEL[p.status] ?? p.status,
                  statusColor: STATUS_COLOR[p.status] ?? "bg-zinc-200",
                  deletedAtFormatted: p.deletedAt ? fmt(p.deletedAt) : "",
                }}
              />
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
