# Guía de tests E2E (Playwright)

**Regla del proyecto:** toda funcionalidad nueva visible para el usuario se
entrega CON su test. Esta guía explica cómo en 2 minutos.

## Correr los tests

```bash
npm run test:e2e                 # buildea y corre contra :3001 (producción)
npx playwright test --grep @public          # solo los públicos (rápido)
E2E_EMAIL=cuenta@test.com E2E_PASSWORD=... npm run test:e2e  # incluye @app
```

⚠️ Los tests corren contra **build de producción** (`next start` en :3001),
no contra el dev server — el modo dev de Next tiene un bug de workers que da
500 espurios en rutas con `notFound()`.

## Dónde va cada test

| La feature es… | Archivo | Tag |
|---|---|---|
| Pantalla pública (landing, pricing, share…) | `e2e/public.spec.ts` | `@public` |
| Flujo logueado (tareas, marcas, billing…) | `e2e/app.spec.ts` (o un spec nuevo) | `@app` |

## Receta de un test `@app`

```ts
test("mi feature hace X", async ({ page }) => {
  await login(page);                    // helper ya existente
  await page.goto("/mi-ruta");
  await expect(page.getByRole("heading", { name: /Mi título/i })).toBeVisible();
  // …interactuar…
});
```

## Reglas de oro

1. **La DB es la real (Neon)** → los tests `@app` SIEMPRE limpian lo que
   crean (ver el test de "crear tarea → borrar → purgar" como modelo).
   Los `@public` no mutan nada.
2. **Selectores estables**: preferí `getByRole`/`getByText` sobre clases CSS
   (las clases cambian con el diseño; los textos y roles no).
3. **Un test por flujo, no por detalle**: probamos "crear tarea funciona",
   no "el botón tiene padding 8px".
4. **Si cambiás un flujo testeado, actualizá su spec en el mismo commit** —
   un test rojo desactualizado es peor que no tener test.
5. Cuenta de prueba: crear un usuario dedicado en la app (ej.
   `e2e@tuagencia.com`) y usarlo SOLO para tests.

## CI

El job `e2e` de GitHub Actions corre la suite completa cuando existen los
secrets `DATABASE_URL_E2E` (recomendado: una **branch de Neon** para tests)
y opcionalmente `E2E_EMAIL`/`E2E_PASSWORD`. Sin secrets, se salta sin fallar.
