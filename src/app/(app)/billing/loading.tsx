/**
 * Skeleton de loading mientras Next.js fetcha la data de la sub-página.
 *
 * Se muestra DENTRO del layout — el header + tabs persisten arriba, este
 * skeleton solo aparece donde irían los componentes específicos de la
 * sub-página. Eso le da la sensación reactiva: tabs no parpadean, solo
 * se muestra un placeholder pulsante en el área de contenido.
 */
export default function BillingLoading() {
  return (
    <div className="space-y-6">
      {/* Card 1 skeleton: stats unificados */}
      <div className="grid divide-y divide-zinc-100 card sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {[0, 1, 2].map((i) => (
          <div key={i} className="px-6 py-5">
            <Bar w="w-20" h="h-2.5" />
            <Bar w="w-32" h="h-7" className="mt-2" />
            <Bar w="w-24" h="h-3" className="mt-2" />
          </div>
        ))}
      </div>

      {/* Card 2 skeleton: uso del plan */}
      <div className="card p-6">
        <Bar w="w-28" h="h-4" />
        <Bar w="w-40" h="h-3" className="mt-2" />
        <div className="mt-5 grid gap-6 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <Bar w="w-24" h="h-2.5" />
              <Bar w="w-16" h="h-6" className="mt-2" />
              <Bar w="w-full" h="h-1.5" className="mt-3 rounded-full" />
            </div>
          ))}
        </div>
      </div>

      {/* Card 3 skeleton: facturas */}
      <div className="card">
        <div className="border-b border-zinc-100 px-6 py-4">
          <Bar w="w-32" h="h-4" />
          <Bar w="w-24" h="h-3" className="mt-2" />
        </div>
        <ul className="divide-y divide-zinc-100">
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex items-center gap-3 px-6 py-3.5">
              <div className="flex-1">
                <Bar w="w-40" h="h-3" />
                <Bar w="w-28" h="h-2.5" className="mt-1.5" />
              </div>
              <Bar w="w-16" h="h-4" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Bar({
  w,
  h,
  className,
}: {
  w: string;
  h: string;
  className?: string;
}) {
  return (
    <div
      className={`${w} ${h} animate-pulse rounded bg-zinc-100 ${className ?? ""}`}
    />
  );
}
