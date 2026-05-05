import Link from "next/link";
import { Bookmark, Grid3x3, Heart, MessageCircle, MoreHorizontal, Plus, Send, UserSquare2, Image as ImageIcon, Search } from "lucide-react";

type PreviewPost = {
  id: string;
  imageUrl: string | null;
  imageCount: number;
};

export default function PhonePreview({
  brandName,
  brandHandle,
  brandId,
  brandLogoUrl,
  brandColor,
  brandBio,
  posts,
}: {
  brandName: string;
  brandHandle: string | null;
  brandId: string;
  brandLogoUrl?: string | null;
  brandColor?: string | null;
  brandBio?: string | null;
  posts: PreviewPost[];
}) {
  const handle = (brandHandle ?? brandName).replace(/^@/, "").toLowerCase();
  const postCount = posts.length;
  const initial = brandName[0]?.toUpperCase() ?? "M";

  return (
    <div className="flex flex-col items-center">
      <p className="mb-4 text-[12px] text-zinc-500">
        Así se verá tu feed en Instagram
      </p>

      {/* Phone frame */}
      <div className="relative mx-auto w-full max-w-[390px]">
        {/* Outer bezel */}
        <div className="relative rounded-[44px] bg-black p-3 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.3),0_0_0_2px_rgba(255,255,255,0.04)_inset]">
          {/* Side buttons (decorative) */}
          <span className="absolute left-[-3px] top-24 h-8 w-1 rounded-l-sm bg-zinc-800" />
          <span className="absolute left-[-3px] top-36 h-12 w-1 rounded-l-sm bg-zinc-800" />
          <span className="absolute left-[-3px] top-52 h-12 w-1 rounded-l-sm bg-zinc-800" />
          <span className="absolute right-[-3px] top-32 h-16 w-1 rounded-r-sm bg-zinc-800" />

          {/* Screen */}
          <div className="relative overflow-hidden rounded-[32px] bg-white">
            {/* Dynamic island / notch */}
            <div className="relative h-7 bg-white">
              <div className="absolute left-1/2 top-1.5 h-6 w-24 -translate-x-1/2 rounded-full bg-black" />
              {/* Status bar */}
              <div className="absolute left-0 right-0 top-1 flex items-center justify-between px-6 text-[11px] font-semibold text-zinc-900">
                <span>9:41</span>
                <span className="flex items-center gap-1">
                  <SignalIcon />
                  <WifiIcon />
                  <BatteryIcon />
                </span>
              </div>
            </div>

            {/* IG Top bar */}
            <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2.5">
              <div className="flex items-center gap-1">
                <span className="text-[16px] font-bold text-zinc-900">{handle}</span>
                <svg className="h-3 w-3 text-zinc-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m6 9 6 6 6-6" /></svg>
              </div>
              <div className="flex items-center gap-3 text-zinc-900">
                <Plus className="h-5 w-5" strokeWidth={2} />
                <MenuIcon />
              </div>
            </div>

            {/* Profile section */}
            <div className="px-4 pt-4">
              <div className="flex items-center gap-5">
                {/* Avatar */}
                <div className="relative">
                  <div
                    className="grid h-[88px] w-[88px] place-items-center rounded-full p-[3px]"
                    style={{
                      background:
                        "conic-gradient(from 180deg, #ff4d8f, #ff2d55, #f59e0b, #ff4d8f)",
                    }}
                  >
                    <div className="grid h-full w-full place-items-center rounded-full bg-white p-[3px]">
                      {brandLogoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={brandLogoUrl}
                          alt=""
                          className="h-full w-full rounded-full object-cover"
                        />
                      ) : (
                        <div
                          className="grid h-full w-full place-items-center rounded-full text-2xl font-bold text-white"
                          style={{
                            background:
                              brandColor ?? "linear-gradient(135deg,#3b82f6,#d946ef,#f43f5e)",
                          }}
                        >
                          {initial}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Stats */}
                <div className="flex flex-1 items-center justify-around text-center">
                  <Stat n={postCount} label="publicaciones" />
                  <Stat n="2,4k" label="seguidores" />
                  <Stat n="186" label="seguidos" />
                </div>
              </div>

              {/* Bio */}
              <div className="mt-3">
                <p className="text-[13px] font-semibold text-zinc-900">{brandName}</p>
                <p className="whitespace-pre-line text-[12px] text-zinc-700 leading-snug">
                  {brandBio ?? "✨ Planeando con MarketaFlow\n📍 Vista previa de tu feed"}
                </p>
              </div>

              {/* Action buttons */}
              <div className="mt-3 flex items-center gap-1.5">
                <button className="flex flex-1 items-center justify-center rounded-md bg-[#0095F6] py-1.5 text-[13px] font-semibold text-white">
                  Seguir
                </button>
                <button className="flex flex-1 items-center justify-center rounded-md bg-zinc-100 py-1.5 text-[13px] font-semibold text-zinc-900">
                  Mensaje
                </button>
                <button className="grid h-7 w-9 place-items-center rounded-md bg-zinc-100">
                  <UserSquare2 className="h-4 w-4 text-zinc-900" />
                </button>
              </div>

              {/* Highlights */}
              <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
                {["Promos", "Tips", "BTS", "Servicios"].map((h, i) => (
                  <div key={h} className="flex flex-col items-center gap-1">
                    <div
                      className="h-14 w-14 rounded-full p-[2px]"
                      style={{
                        background: ["#3b5fff", "#8a2be2", "#ff4d8f", "#ff2d55"][i % 4],
                      }}
                    >
                      <div className="grid h-full w-full place-items-center rounded-full bg-zinc-100 text-[10px] font-semibold text-zinc-700">
                        {h[0]}
                      </div>
                    </div>
                    <span className="text-[10px] text-zinc-700 max-w-[56px] truncate">{h}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Tabs */}
            <div className="mt-2 flex border-t border-zinc-200">
              <TabIcon active>
                <Grid3x3 className="h-5 w-5" strokeWidth={2} />
              </TabIcon>
              <TabIcon>
                <ReelsIcon />
              </TabIcon>
              <TabIcon>
                <UserSquare2 className="h-5 w-5" strokeWidth={2} />
              </TabIcon>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-3 gap-[1px] bg-zinc-200">
              {posts.length === 0 ? (
                <div className="col-span-3 flex flex-col items-center gap-2 bg-white py-16 text-center">
                  <ImageIcon className="h-7 w-7 text-zinc-300" />
                  <p className="text-[12px] text-zinc-500">Sin posts aún</p>
                </div>
              ) : (
                posts.map((p) => (
                  <Link
                    key={p.id}
                    href={`/brands/${brandId}/posts/${p.id}`}
                    className="relative block aspect-square bg-white"
                  >
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.imageUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-50 via-fuchsia-50 to-rose-50">
                        <ImageIcon className="h-4 w-4 text-zinc-400" />
                      </div>
                    )}
                    {p.imageCount > 1 && (
                      <span className="absolute right-1.5 top-1.5">
                        <CarouselIcon />
                      </span>
                    )}
                  </Link>
                ))
              )}
            </div>

            {/* Bottom bar (decorative) */}
            <div className="flex items-center justify-around border-t border-zinc-200 bg-white px-3 py-2.5">
              <HomeIcon />
              <Search className="h-5 w-5" strokeWidth={2} />
              <Plus className="h-5 w-5 rounded border border-zinc-900 p-0.5" strokeWidth={2.5} />
              <Heart className="h-5 w-5" strokeWidth={2} />
              <div className="h-5 w-5 rounded-full bg-gradient-to-br from-blue-500 via-fuchsia-500 to-rose-500" />
            </div>

            {/* Home indicator */}
            <div className="flex h-5 items-center justify-center bg-white">
              <span className="h-1 w-32 rounded-full bg-zinc-900" />
            </div>
          </div>
        </div>
      </div>

      <p className="mt-4 max-w-md text-center text-[11px] text-zinc-500">
        Esto es solo una previsualización. Los seguidores y bio son ficticios.
        Los posts vienen de tu feed real (incluso borradores y pendientes).
      </p>
    </div>
  );
}

function Stat({ n, label }: { n: number | string; label: string }) {
  return (
    <div>
      <p className="text-[15px] font-bold text-zinc-900 tabular-nums">{n}</p>
      <p className="text-[11px] text-zinc-700">{label}</p>
    </div>
  );
}

function TabIcon({ children, active }: { children: React.ReactNode; active?: boolean }) {
  return (
    <div
      className={`flex flex-1 items-center justify-center py-2 ${
        active ? "border-t-2 border-zinc-900 text-zinc-900" : "text-zinc-400"
      }`}
    >
      {children}
    </div>
  );
}

function SignalIcon() {
  return (
    <svg width="14" height="10" viewBox="0 0 18 12" fill="currentColor">
      <rect x="0" y="9" width="3" height="3" rx="0.5" />
      <rect x="5" y="6" width="3" height="6" rx="0.5" />
      <rect x="10" y="3" width="3" height="9" rx="0.5" />
      <rect x="15" y="0" width="3" height="12" rx="0.5" />
    </svg>
  );
}
function WifiIcon() {
  return (
    <svg width="14" height="10" viewBox="0 0 16 12" fill="currentColor">
      <path d="M8 11.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
      <path d="M8 6.5a4.5 4.5 0 0 1 3.182 1.318l1.06-1.06a6 6 0 0 0-8.485 0l1.06 1.06A4.5 4.5 0 0 1 8 6.5Z" />
      <path d="M8 1.5a9.5 9.5 0 0 0-6.717 2.783l1.06 1.06a8 8 0 0 1 11.314 0l1.06-1.06A9.5 9.5 0 0 0 8 1.5Z" />
    </svg>
  );
}
function BatteryIcon() {
  return (
    <svg width="22" height="11" viewBox="0 0 24 12" fill="none" stroke="currentColor" strokeWidth="1">
      <rect x="0.5" y="0.5" width="20" height="11" rx="2.5" />
      <rect x="2" y="2" width="17" height="8" rx="1.5" fill="currentColor" />
      <rect x="21.5" y="4" width="2" height="4" rx="1" fill="currentColor" />
    </svg>
  );
}
function MenuIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}
function HomeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m3 12 9-9 9 9" />
      <path d="M5 10v10h14V10" />
    </svg>
  );
}
function ReelsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="m10 9 5 3-5 3z" fill="currentColor" />
      <path d="M3 9h18M3 15h18" />
    </svg>
  );
}
function CarouselIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" style={{ filter: "drop-shadow(0 0 1px rgba(0,0,0,0.6))" }}>
      <rect x="6" y="2" width="14" height="14" rx="2" fill="rgba(0,0,0,0.2)" />
      <rect x="2" y="6" width="14" height="14" rx="2" fill="rgba(0,0,0,0.4)" />
    </svg>
  );
}
