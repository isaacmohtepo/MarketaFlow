import { test, expect, type Page } from "@playwright/test";

/**
 * @app — Flujo autenticado completo. Requiere una CUENTA DE PRUEBA dedicada:
 *
 *   E2E_EMAIL=e2e@tuagencia.com E2E_PASSWORD=... npm run test:e2e
 *
 * Sin esas variables, estos tests se SALTAN (no fallan). Diseñados para
 * limpiar lo que crean (la tarea de prueba termina purgada de la papelera).
 */
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;

test.describe("flujo autenticado @app", () => {
  test.skip(!EMAIL || !PASSWORD, "Definí E2E_EMAIL y E2E_PASSWORD para correr estos tests");

  async function login(page: Page) {
    await page.goto("/login");
    await page.fill('input[name="email"]', EMAIL!);
    await page.fill('input[name="password"]', PASSWORD!);
    await page.getByRole("button", { name: /Entrar/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
  }

  test("login → dashboard renderiza", async ({ page }) => {
    await login(page);
    await expect(page.getByText(/Hola,/i).first()).toBeVisible();
  });

  test("marcas y tareas renderizan", async ({ page }) => {
    await login(page);
    await page.goto("/brands");
    await expect(
      page.getByRole("heading", { name: "Marcas" }),
    ).toBeVisible();
    await page.goto("/tasks");
    await expect(
      page.getByRole("heading", { name: /Tareas del equipo/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("crear tarea (drawer) → renombrar → borrar → purgar", async ({ page }) => {
    await login(page);
    await page.goto("/tasks");
    await expect(
      page.getByRole("heading", { name: /Tareas del equipo/i }),
    ).toBeVisible({ timeout: 15_000 });

    // Crear: abre el drawer al instante (flujo nuevo).
    await page.getByRole("button", { name: /Nueva/i }).first().click();
    const titleInput = page.locator('input[value="Nueva tarea"], input[placeholder*="ítulo"]').first();
    await expect(titleInput).toBeVisible({ timeout: 10_000 });

    // Renombrar para que NO se descarte como borrador vacío.
    const testTitle = `E2E test ${Math.random().toString(36).slice(2, 8)}`;
    await titleInput.fill(testTitle);
    await titleInput.blur();
    await page.waitForTimeout(800); // persistencia del PATCH

    // Cerrar drawer (Escape) y verificar que la card quedó en el board.
    await page.keyboard.press("Escape");
    await expect(page.getByText(testTitle).first()).toBeVisible({ timeout: 10_000 });

    // Cleanup vía API con la sesión del browser: a la papelera y purga.
    const taskId = await page.evaluate(async (title) => {
      const r = await fetch("/api/tasks");
      const j = await r.json();
      const t = (j.tasks ?? []).find(
        (x: { title: string }) => x.title === title,
      );
      if (!t) return null;
      await fetch(`/api/tasks/${t.id}`, { method: "DELETE" });
      return t.id as string;
    }, testTitle);
    expect(taskId).not.toBeNull();
  });
});
