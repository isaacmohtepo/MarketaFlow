import { userColor, userInitials } from "@/lib/avatar";

/**
 * Avatar reutilizable: muestra la FOTO de perfil si existe (`src`), y si no,
 * las INICIALES del nombre con un color estable. Usar en TODO lugar donde se
 * represente a una persona (comentarios, actividad, notificaciones, etc.).
 *
 * `name` se usa para iniciales + color y como alt/title. `src` es la avatarUrl
 * (puede ser null/undefined). `size` es el lado en px.
 */
export default function Avatar({
  name,
  src,
  size = 28,
  className = "",
}: {
  name: string | null | undefined;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const label = name?.trim() || "?";
  const dim = { width: size, height: size };

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={label}
        title={label}
        style={dim}
        className={`flex-shrink-0 rounded-full object-cover ${className}`}
      />
    );
  }

  return (
    <span
      title={label}
      style={{ ...dim, background: userColor(label), fontSize: Math.round(size * 0.4) }}
      className={`grid flex-shrink-0 place-items-center rounded-full font-bold text-white ${className}`}
    >
      {userInitials(label)}
    </span>
  );
}
