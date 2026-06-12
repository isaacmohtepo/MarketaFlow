import Link from "next/link";
import { ChevronRight, Layers } from "lucide-react";

const ROLE_LABEL: Record<string, string> = {
  owner: "Dueño",
  editor: "Editor",
  client: "Cliente",
};

const ROLE_TINT: Record<string, string> = {
  owner: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-100",
  editor: "bg-blue-50 text-blue-700 ring-blue-100",
  client: "bg-emerald-50 text-emerald-700 ring-emerald-100",
};

const COLORS = ["#3b5fff", "#8a2be2", "#ff4d8f", "#ff2d55", "#0ea5e9", "#22c55e"];

export default function BrandsAccessList({
  brands,
}: {
  brands: {
    id: string;
    slug: string | null;
    name: string;
    logoUrl: string | null;
    color: string | null;
    role: string;
    agencyName: string;
  }[];
}) {
  if (brands.length === 0) {
    return (
      <div className="card p-6 text-center">
        <Layers className="mx-auto h-6 w-6 text-zinc-300" />
        <p className="mt-2 text-[13px] font-medium text-zinc-700">Sin acceso a marcas</p>
        <p className="text-2xs text-zinc-500">
          Cuando te inviten a una marca aparecerá aquí.
        </p>
      </div>
    );
  }

  return (
    <ul className="card divide-y divide-zinc-100/80 overflow-hidden">
      {brands.map((b, i) => {
        const bg = b.color ?? COLORS[i % COLORS.length];
        const roleLabel = ROLE_LABEL[b.role] ?? b.role;
        const roleTint = ROLE_TINT[b.role] ?? "bg-zinc-50 text-zinc-700 ring-zinc-100";
        return (
          <li key={b.id}>
            <Link
              href={`/brands/${b.slug ?? b.id}`}
              className="group flex items-center gap-3 p-3 transition hover:bg-zinc-50"
            >
              <span
                className="grid h-9 w-9 flex-shrink-0 place-items-center overflow-hidden rounded-md text-[12px] font-bold text-white"
                style={{ background: bg }}
              >
                {b.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.logoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  b.name[0]?.toUpperCase()
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-zinc-900">{b.name}</p>
                <p className="truncate text-2xs text-zinc-500">{b.agencyName}</p>
              </div>
              <span
                className={`flex-shrink-0 rounded-full px-2 py-0.5 text-3xs font-semibold ring-1 ${roleTint}`}
              >
                {roleLabel}
              </span>
              <ChevronRight className="h-4 w-4 flex-shrink-0 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-zinc-500" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
