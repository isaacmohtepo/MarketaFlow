# Design System de MarketaFlow

Guía para construir pantallas nuevas con piezas reutilizables. **Antes de
escribir UI a mano, revisa este catálogo** — casi todo lo que necesitas ya
existe.

## Reglas de oro

1. **Nunca hardcodear colores de acento.** El white-label de las agencias
   sobreescribe `--brand-from/via1/via2/to` y las clases `.brand-gradient` /
   `.btn-gradient` en runtime. Usa `<Button>` o esas clases — jamás un
   `bg-violet-600` para un CTA principal.
2. **Estados siempre con `<StatusPill>`.** Los tonos viven en
   `src/lib/tones.ts` (`good | warn | bad | info | accent | neutral`).
3. **Toda página abre con `<PageHeader>`.**
4. **Texto micro con tokens**: `text-3xs` (10px) · `text-2xs` (11px) ·
   `text-xs` (12px) · `text-sm` (14px). No volver a `text-[Npx]` arbitrario.
5. **Superficies**: clase `.card` (radio 14px + sombra sutil). Inputs:
   `<Input>` (o clase `.input-soft`). Radios: `rounded-card` / `rounded-control`.
6. Las páginas públicas usan `.theme-dark` — el kit funciona en ambos temas
   porque todo se basa en variables CSS.

## Receta: pantalla nueva en 5 minutos

```tsx
import { Layers } from "lucide-react";
import { PageHeader, Button, EmptyState, StatusPill, Stat } from "@/components/ui";

export default async function MiPantalla() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Workspace" icon={Layers}
        title="Mi feature"
        subtitle="Qué hace esta pantalla."
        actions={<Button size="sm">Acción principal</Button>}
      />
      <div className="mt-5 card p-5">…contenido…</div>
    </div>
  );
}
```

## Catálogo (`import { … } from "@/components/ui"`)

| Componente | Para qué | Ejemplo |
|---|---|---|
| `Button` | Todo botón. `variant`: `primary` (gradiente brand) / `secondary` / `ghost` / `danger`. `size sm\|md`, `loading`, `href` (lo vuelve link) | `<Button onClick={save} loading={saving}>Guardar</Button>` |
| `Input` `Textarea` `Select` | Controles de formulario (sobre `.input-soft`) | `<Input name="email" placeholder="…" />` |
| `Field` | Label + control + hint/error | `<Field label="Nombre" error={err}><Input/></Field>` |
| `StatusPill` | Pills de estado. `status` (posts, auto-label/color) o `tone`+children (genérico). `size sm\|md` | `<StatusPill status={post.status}/>` · `<StatusPill tone="good">Pagada</StatusPill>` |
| `PageHeader` | Header de página: eyebrow/icon/título/subtítulo/acciones/volver | ver receta |
| `Modal` | Diálogo con overlay; ESC + click-afuera incluidos. `size sm\|md\|lg\|xl` | `<Modal open={open} onClose={close} title="Editar">…</Modal>` |
| `EmptyState` | Vacíos (icono+título+sub+acción). `variant="bare"` dentro de otra card | `<EmptyState icon={Sparkles} title="Sin marcas"/>` |
| `Stat` | Tile de métrica (label uppercase + valor + hint). `tone` colorea el valor | `<Stat label="Pendientes" value={n} tone={n>0?"bad":undefined}/>` |
| `Panel` / `PanelEmpty` | Card-widget con header (icono+título+count+link) — estilo dashboard | `<Panel title="Por revisar" icon={Clock} count={n} href="/inbox" hrefLabel="Ver">…</Panel>` |
| `DataTable<T>` | Tablas estilo admin, tipadas por fila | `<DataTable rows={users} rowKey={u=>u.id} columns={[{header:"Email", cell:u=>u.email}]}/>` |
| `Menu` / `MenuItem` | Dropdown de acciones/orden con click-outside | `<Menu button={<span>Ordenar</span>}><MenuItem onSelect={…}>A-Z</MenuItem></Menu>` |

**Hooks:** `useClickOutside(ref, onClose, enabled)` en `src/hooks/`.

## Piezas que ya existían (siguen siendo parte del sistema)

- `Avatar` (`src/components/Avatar.tsx`) — foto o iniciales de USUARIO.
- `Picker` — dropdown buscable para seleccionar datos (marcas, usuarios).
- `Skeleton` — loaders.
- `useConfirm()` (ConfirmDialog) — confirmaciones/prompts; NO armes un Modal
  para un simple "¿estás seguro?".
- `useUpgrade()` — modal de upgrade (se dispara solo en 402 vía `apiFetch`).
- `usePermissions()` — checks de permisos en cliente.
- `toast` (sonner) — feedback de acciones.

## Tokens (definidos en `src/app/globals.css` `@theme`)

- **Texto**: `text-3xs` 10px · `text-2xs` 11px (sin line-height — se comportan
  como los arbitrarios que reemplazaron). 12px+ usa la escala Tailwind.
- **Radios**: `rounded-card` 14px · `rounded-control` 10px.
- **Sombras**: `shadow-card` (superficie) · `shadow-pop` (dropdown/modal).
- **Tema**: variables `--bg-app/--bg-elev/--line/...` (light + `.theme-dark`).
- **Brand**: `--brand-from/via1/via2/to` → `.brand-gradient`,
  `.brand-gradient-text`, `.btn-gradient` (overrideables por white-label).

## Cómo extender el kit

Un componente entra a `src/components/ui/` cuando el mismo patrón aparece en
2+ pantallas. Reglas: archivo corto enfocado, JSDoc con @example, usar `cn()`
de `@/lib/utils` para merge de clases, exportarlo en `ui/index.ts` y
documentarlo en esta tabla.
