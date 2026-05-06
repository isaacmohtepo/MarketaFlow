import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import BroadcastEditor from "./BroadcastEditor";

export default function NewBroadcastPage() {
  return (
    <div className="space-y-4">
      <Link
        href="/admin/communications"
        className="inline-flex items-center gap-1 text-[12px] font-medium text-zinc-500 hover:text-zinc-900"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Volver
      </Link>
      <BroadcastEditor />
    </div>
  );
}
