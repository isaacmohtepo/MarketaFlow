import { defineConfig, devices } from "@playwright/test";

/**
 * Tests E2E de MarketaFlow.
 *
 * Dos niveles (la DB es la real de Neon — los tests están diseñados para NO
 * ensuciar datos):
 *  - @public: páginas públicas + redirects + login fallido. Siempre corren.
 *  - @app:    flujo autenticado (dashboard, tareas con create+cleanup). Solo
 *             corren si E2E_EMAIL y E2E_PASSWORD están seteados (cuenta de
 *             prueba dedicada — crear una en la app y exportar las vars).
 *
 * Corre contra BUILD DE PRODUCCIÓN en :3001 (no contra el dev server: el
 * modo dev de Next/Turbopack tiene un bug de workers que da 500 espurios en
 * rutas con notFound() — en prod responden 404 correcto).
 *
 * Local:  npm run test:e2e          (buildea y levanta :3001 solo)
 * Con app: E2E_EMAIL=... E2E_PASSWORD=... npm run test:e2e
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false, // secuencial: evita pisarse con rate limits
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3001",
    trace: "on-first-retry",
    locale: "es-CO",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run build && npx next start -p 3001",
    url: "http://localhost:3001/login",
    reuseExistingServer: true,
    timeout: 300_000,
  },
});
