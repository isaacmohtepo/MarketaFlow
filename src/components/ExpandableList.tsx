"use client";

import { ChevronDown } from "lucide-react";
import { Children, useState, type ReactNode } from "react";

export default function ExpandableList({
  initialCount = 5,
  step,
  children,
  className = "card divide-y divide-zinc-100/80 overflow-hidden",
}: {
  initialCount?: number;
  step?: number;
  children: ReactNode;
  className?: string;
}) {
  const items = Children.toArray(children);
  const total = items.length;
  const [visible, setVisible] = useState(Math.min(initialCount, total));
  const remaining = total - visible;
  const allShown = remaining === 0;

  function expand() {
    setVisible((v) => Math.min(total, step ? v + step : total));
  }
  function collapse() {
    setVisible(initialCount);
  }

  return (
    <>
      <ul className={className}>{items.slice(0, visible)}</ul>
      {total > initialCount && (
        <div className="mt-2 flex justify-center">
          <button
            onClick={allShown ? collapse : expand}
            className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
          >
            {allShown ? (
              <>
                Mostrar menos
                <ChevronDown className="h-3 w-3 rotate-180 transition" />
              </>
            ) : (
              <>
                Ver {remaining} más
                <ChevronDown className="h-3 w-3 transition" />
              </>
            )}
          </button>
        </div>
      )}
    </>
  );
}
