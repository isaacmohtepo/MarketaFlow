/**
 * Kit UI de MarketaFlow — componentes reutilizables para TODA pantalla nueva.
 * Guía completa con ejemplos: docs/design-system.md
 *
 * Reglas de oro:
 *  1. NUNCA hardcodear colores de acento — usar Button/clases brand-* (el
 *     white-label los sobreescribe por CSS variables).
 *  2. Estados siempre con <StatusPill> (tonos en src/lib/tones.ts).
 *  3. Toda página abre con <PageHeader>.
 *  4. Texto micro: text-3xs (10px) / text-2xs (11px) / text-xs (12px) /
 *     text-sm (14px) — no volver a text-[Npx] arbitrario.
 *
 * Complementos que ya existían (no están acá pero son parte del sistema):
 *  Avatar, Picker, Skeleton, ConfirmDialog (useConfirm), UpgradeProvider,
 *  PermissionsProvider, KbdHint — en src/components/.
 */
export { default as Button } from "./Button";
export { Input, Textarea, Select, Field } from "./Field";
export { default as StatusPill } from "./StatusPill";
export { default as PageHeader } from "./PageHeader";
export { default as Modal } from "./Modal";
export { default as EmptyState } from "./EmptyState";
export { default as Stat } from "./Stat";
export { default as Panel, PanelEmpty } from "./Panel";
export { default as DataTable, type Column } from "./DataTable";
export { default as Menu, MenuItem } from "./Menu";
