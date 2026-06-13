import { test, expect } from "@playwright/test";

/**
 * @public — Smoke tests de superficies públicas. No mutan datos.
 */

test("landing renderiza con el hero @public", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Contenido, tareas y equipo/i }),
  ).toBeVisible();
});

test("pricing renderiza planes @public", async ({ page }) => {
  await page.goto("/pricing");
  await expect(page.locator("h1").first()).toBeVisible();
  // Debe mostrar al menos un precio en COP.
  await expect(page.getByText(/\$\s?[\d.,]+/).first()).toBeVisible();
});

test("login renderiza el formulario @public", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Bienvenido" })).toBeVisible();
  await expect(page.locator('input[name="email"]')).toBeVisible();
  await expect(page.locator('input[name="password"]')).toBeVisible();
});

test("rutas privadas redirigen a login sin sesión @public", async ({ page }) => {
  for (const path of ["/dashboard", "/tasks", "/brands", "/billing"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  }
});

test("login con credenciales inválidas muestra error y NO entra @public", async ({
  page,
}) => {
  await page.goto("/login");
  await page.fill('input[name="email"]', "no-existe-e2e@example.com");
  await page.fill('input[name="password"]', "password-incorrecto-123");
  await page.getByRole("button", { name: /Entrar/i }).click();
  // Sigue en /login (no redirige al dashboard) y muestra feedback de error.
  await expect(page).toHaveURL(/\/login/);
  await expect(
    page.getByText(/incorrect|inválid|no válid|demasiados/i).first(),
  ).toBeVisible({ timeout: 10_000 });
});

test("share token falso devuelve 404 @public", async ({ page }) => {
  const res = await page.goto("/share/token-falso-e2e-000");
  expect(res?.status()).toBe(404);
});

test("blog index lista artículos @public", async ({ page }) => {
  await page.goto("/blog");
  await expect(page.getByRole("heading", { name: /IA, agencias y contenido/i })).toBeVisible();
  // Al menos una card de artículo enlaza a /blog/<slug>.
  await expect(page.locator('a[href^="/blog/"]').first()).toBeVisible();
});

test("artículo del blog renderiza con su contenido @public", async ({ page }) => {
  await page.goto("/blog/ia-para-agencias-de-marketing-2026");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /IA para agencias de marketing en 2026/i,
    }),
  ).toBeVisible();
  // El CTA de registro aparece al final del artículo.
  await expect(page.getByRole("link", { name: /Empezar gratis/i }).first()).toBeVisible();
});

test("artículo inexistente devuelve 404 @public", async ({ page }) => {
  const res = await page.goto("/blog/no-existe-este-articulo-e2e");
  expect(res?.status()).toBe(404);
});

test("sitemap y robots responden @public", async ({ page }) => {
  const sitemap = await page.goto("/sitemap.xml");
  expect(sitemap?.status()).toBe(200);
  expect(await sitemap?.text()).toContain("/blog/");

  const robots = await page.goto("/robots.txt");
  expect(robots?.status()).toBe(200);
  expect(await robots?.text()).toMatch(/sitemap/i);
});
