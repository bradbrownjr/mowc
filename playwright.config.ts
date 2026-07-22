import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end suite (ROADMAP 0.10.1). Drives the real production serving
 * path: the built Express server (server/dist/index.js) serves both the
 * static SvelteKit client and the API from one origin, exactly as the
 * Docker image does. `npm run test:e2e` builds first, so the server this
 * config starts is always current.
 *
 * Each run gets a throwaway SQLite database in a fresh temp directory, so
 * tests never see each other's or a dev server's data. Specs are named
 * *.e2e.ts (not *.spec.ts) so vitest's default glob never picks them up;
 * `npm test` and `npm run test:e2e` stay fully separate.
 */
const PORT = Number(process.env["E2E_PORT"] ?? 7130);
const HOST = "127.0.0.1";
const dataDir = mkdtempSync(path.join(tmpdir(), "mowc-e2e-"));

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: false,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 1 : 0,
  workers: 1,
  reporter: process.env["CI"]
    ? [["github"], ["list"], ["html", { open: "never" }]]
    : "list",
  use: {
    baseURL: `http://${HOST}:${PORT}`,
    trace: "on-first-retry"
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node server/dist/index.js",
    url: `http://${HOST}:${PORT}/healthz`,
    reuseExistingServer: !process.env["CI"],
    timeout: 60_000,
    env: {
      MOWC_PORT: String(PORT),
      MOWC_DATA_DIR: dataDir,
      MOWC_ADMIN_EMAIL: "e2e-admin@example.com",
      // The whole suite drives the app from one IP as many users in quick
      // succession, which legitimately exceeds the production per-IP/per-user
      // rate limits (server/src/auth/rateLimit.ts). Disable them for the test
      // server only; production leaves this unset.
      MOWC_DISABLE_RATE_LIMITS: "1"
    }
  }
});
