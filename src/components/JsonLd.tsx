/**
 * Inyecta datos estructurados (JSON-LD / schema.org) en el <head> del HTML.
 * Google los usa para rich results. Server component — se serializa en SSR.
 */
export default function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      // El contenido es nuestro (no input de usuario); JSON.stringify ya
      // escapa comillas. Reemplazamos "<" por su escape unicode por si algún
      // texto trae "</script>".
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
