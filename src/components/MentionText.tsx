// Renderiza texto con @menciones resaltadas (no es un link clickable porque no
// guardamos el userId en el cuerpo del comentario; es solo realce visual).

const MENTION_RE = /(@(?:"[^"]+"|[\w.\-áéíóúñÁÉÍÓÚÑ]+))/g;

export default function MentionText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const parts = text.split(MENTION_RE);
  return (
    <span className={className}>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <span
            key={i}
            className="rounded px-0.5 font-semibold text-fuchsia-700"
            style={{ background: "rgba(138,43,226,0.08)" }}
          >
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </span>
  );
}
