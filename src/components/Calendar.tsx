import Link from "next/link";
import { STATUS_COLOR } from "@/lib/utils";

type CalPost = {
  id: string;
  imageUrl: string | null;
  status: string;
  scheduledAt: Date | null;
  caption: string;
};

const DAY_NAMES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
function ymKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function parseYM(s: string | undefined): Date {
  if (!s) return startOfMonth(new Date());
  const m = /^(\d{4})-(\d{1,2})$/.exec(s);
  if (!m) return startOfMonth(new Date());
  return new Date(Number(m[1]), Number(m[2]) - 1, 1);
}

export default function Calendar({
  brandId,
  posts,
  monthParam,
}: {
  brandId: string;
  posts: CalPost[];
  monthParam?: string;
}) {
  const monthStart = parseYM(monthParam);
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();

  // Posts grouped by day-of-month for this month
  const byDay = new Map<number, CalPost[]>();
  for (const p of posts) {
    if (!p.scheduledAt) continue;
    if (p.scheduledAt.getFullYear() !== year || p.scheduledAt.getMonth() !== month) continue;
    const day = p.scheduledAt.getDate();
    const arr = byDay.get(day) ?? [];
    arr.push(p);
    byDay.set(day, arr);
  }

  // Build cells: pad before with previous month's tail so the first day lands under correct weekday (Mon-first)
  const firstWeekdayJs = monthStart.getDay(); // 0=Sun..6=Sat
  const leading = (firstWeekdayJs + 6) % 7; // shift so Monday=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((leading + daysInMonth) / 7) * 7;

  const cells: Array<{ day: number | null; isToday: boolean }> = [];
  const today = new Date();
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - leading + 1;
    if (dayNum < 1 || dayNum > daysInMonth) {
      cells.push({ day: null, isToday: false });
    } else {
      const isToday =
        today.getFullYear() === year &&
        today.getMonth() === month &&
        today.getDate() === dayNum;
      cells.push({ day: dayNum, isToday });
    }
  }

  const prev = ymKey(addMonths(monthStart, -1));
  const next = ymKey(addMonths(monthStart, 1));

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-zinc-900">
          {MONTH_NAMES[month]} {year}
        </h3>
        <div className="flex gap-1.5">
          <Link
            href={`/brands/${brandId}?view=calendar&month=${prev}`}
            className="grid h-8 w-8 place-items-center rounded-lg border divider bg-white text-sm text-zinc-700 hover:bg-zinc-50"
          >
            ←
          </Link>
          <Link
            href={`/brands/${brandId}?view=calendar`}
            className="rounded-lg border divider bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Hoy
          </Link>
          <Link
            href={`/brands/${brandId}?view=calendar&month=${next}`}
            className="grid h-8 w-8 place-items-center rounded-lg border divider bg-white text-sm text-zinc-700 hover:bg-zinc-50"
          >
            →
          </Link>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
        {DAY_NAMES.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((cell, i) => {
          const dayPosts = cell.day ? byDay.get(cell.day) ?? [] : [];
          return (
            <div
              key={i}
              className={`min-h-[68px] rounded-lg p-1 text-xs transition sm:min-h-[110px] sm:p-1.5 ${
                cell.day == null
                  ? "bg-transparent"
                  : cell.isToday
                    ? "bg-zinc-50 ring-1 ring-fuchsia-400"
                    : "bg-white ring-1 ring-zinc-100"
              }`}
            >
              {cell.day && (
                <div
                  className={`mb-1 text-right text-[11px] font-semibold ${
                    cell.isToday ? "brand-gradient-text" : "text-zinc-500"
                  }`}
                >
                  {cell.day}
                </div>
              )}
              <div className="space-y-1">
                {dayPosts.slice(0, 3).map((p) => (
                  <Link
                    key={p.id}
                    href={`/brands/${brandId}/posts/${p.id}`}
                    className="group flex items-center gap-1.5 rounded-md bg-zinc-50 p-1 ring-1 ring-transparent transition hover:ring-fuchsia-400 hover:bg-white"
                  >
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.imageUrl}
                        alt=""
                        className="h-7 w-7 flex-shrink-0 rounded object-cover"
                      />
                    ) : (
                      <span className="block h-7 w-7 flex-shrink-0 rounded bg-gradient-to-br from-blue-50 via-fuchsia-50 to-rose-50" />
                    )}
                    <div className="min-w-0 flex-1">
                      <span
                        className={`block truncate rounded px-1 text-[10px] font-medium ${STATUS_COLOR[p.status] ?? "bg-zinc-200"}`}
                      >
                        {p.scheduledAt
                          ? p.scheduledAt.toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : ""}
                      </span>
                    </div>
                  </Link>
                ))}
                {dayPosts.length > 3 && (
                  <p className="text-[10px] text-zinc-500">+{dayPosts.length - 3} más</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
