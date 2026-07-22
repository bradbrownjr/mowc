import { expect, test, type Page } from "@playwright/test";
import { buildCharacterViaUi, createCampaignViaUi, makePlaceholderPack, makeUser, registerViaUi } from "./fixtures.js";

/**
 * Hunter-facing half of Keeper-approved pack-transfer migration
 * (docs/adr/0003-pack-transfer-approval.md, ROADMAP 0.15.4). The Keeper
 * approval dialog's own UI is covered by e2e/migrationApproval.e2e.ts (0.15.3),
 * which seeds a pending request directly via the API; this spec instead drives
 * the request's CREATION through the "Move character" panel's UI (the fork
 * this build adds), and seeds the Keeper's approve/deny decision via the API
 * (as the task allows) so the test can stay single-user, single-page: the same
 * account Keeps both campaigns here, exactly like e2e/migrate.e2e.ts already
 * does for the plain direct-migrate flow.
 */

interface Scaffold {
  page: Page;
  campaignA: string;
  campaignB: string;
  characterId: string;
  name: string;
}

/**
 * Builds two campaigns for one signed-in user: campaign A has the placeholder
 * pack attached and hosts the character; campaign B deliberately has no pack
 * attached. Drives the character sheet's "Move character" panel to send a
 * move request to campaign B, and returns before deciding it.
 */
async function createPendingRequestViaUi(page: Page, characterName: string): Promise<Scaffold> {
  const user = makeUser();
  await registerViaUi(page, user);

  const campaignA = await createCampaignViaUi(page, "Source Table");
  const campaignB = await createCampaignViaUi(page, "Destination Table");

  const packRes = await page.request.post("/api/content-packs", { data: makePlaceholderPack() });
  expect(packRes.ok(), `pack upload failed: ${packRes.status()}`).toBeTruthy();
  const packId = (await packRes.json()).id as string;
  const attachA = await page.request.patch(`/api/campaigns/${campaignA}`, { data: { packIds: [packId] } });
  expect(attachA.ok(), `attach to source campaign failed: ${attachA.status()}`).toBeTruthy();
  // Campaign B deliberately never gets this pack attached.

  const characterId = await buildCharacterViaUi(page, campaignA, characterName);
  await expect(page.getByRole("heading", { name: characterName })).toBeVisible();

  // The control proactively flushes the source scope on mount; wait for the
  // real "unsynced changes cleared" state rather than a bare timeout, same as
  // e2e/migrate.e2e.ts.
  await page.getByLabel("Destination").selectOption({ label: "Destination Table" });

  // The destination lacks the pack, so the notice and button both fork to the
  // approval-required copy/label (ADR 0003 Decision 1).
  await expect(page.getByText(/send them a request to approve/)).toBeVisible();
  const sendButton = page.getByRole("button", { name: "Send move request" });
  await expect(sendButton).toBeEnabled({ timeout: 15_000 });
  await sendButton.click();

  // Wait for the pending-move banner before returning. It only renders once
  // createMigrationRequest's POST has resolved, so this is the signal that the
  // request actually exists server-side. Without it, callers that immediately
  // query .../migrate-requests/latest race the in-flight creation and get null.
  await expect(page.getByRole("heading", { name: "Move pending" })).toBeVisible();

  return { page, campaignA, campaignB, characterId, name: characterName };
}

test("moving into a campaign that lacks the pack creates a pending request instead of moving", async ({ page }) => {
  const { campaignA, campaignB, name } = await createPendingRequestViaUi(page, "Wanderer Placeholder");

  // A pending-move banner replaces the "Send move request" flow with a status
  // surface; the character has NOT moved anywhere yet.
  await expect(page.getByRole("heading", { name: "Move pending" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel request" })).toBeVisible();

  await page.goto(`/campaigns/${campaignA}/characters`);
  await expect(page.getByRole("link", { name })).toBeVisible();

  await page.goto(`/campaigns/${campaignB}/characters`);
  await expect(page.getByRole("link", { name })).toHaveCount(0);
});

test("an approved request re-points the hunter to the character's new home", async ({ page }) => {
  const { campaignA, campaignB, characterId, name } = await createPendingRequestViaUi(page, "Drifter Placeholder");

  const latestRes = await page.request.get(`/api/characters/${characterId}/migrate-requests/latest`);
  expect(latestRes.ok()).toBeTruthy();
  const { migrationId } = (await latestRes.json()) as { migrationId: string };

  // The same account Keeps campaign B too, so it can approve its own pending
  // request via the API (task-sanctioned seeding of the Keeper's decision).
  const approveRes = await page.request.post(`/api/campaigns/${campaignB}/migrate-requests/${migrationId}/approve`);
  expect(approveRes.ok(), `approve failed: ${approveRes.status()}`).toBeTruthy();

  // Revisit the OLD sheet: the status poll sees "approved" and auto-replays
  // /migrate with the same migrationId, landing on the new sheet.
  await page.goto(`/campaigns/${campaignA}/characters/${characterId}`);
  await page.waitForURL(new RegExp(`/campaigns/${campaignB}/characters/[0-9a-f-]+`));
  await expect(page.getByRole("heading", { name })).toBeVisible();

  await page.goto(`/campaigns/${campaignA}/characters`);
  await expect(page.getByRole("link", { name })).toHaveCount(0);

  await page.goto(`/campaigns/${campaignB}/characters`);
  await expect(page.getByRole("link", { name })).toBeVisible();
});

test("a denied request offers move-without-the-pack, which completes the move", async ({ page }) => {
  const { campaignA, campaignB, characterId, name } = await createPendingRequestViaUi(page, "Drifter Two Placeholder");

  const latestRes = await page.request.get(`/api/characters/${characterId}/migrate-requests/latest`);
  expect(latestRes.ok()).toBeTruthy();
  const { migrationId } = (await latestRes.json()) as { migrationId: string };

  const denyRes = await page.request.post(`/api/campaigns/${campaignB}/migrate-requests/${migrationId}/deny`);
  expect(denyRes.ok(), `deny failed: ${denyRes.status()}`).toBeTruthy();

  await page.goto(`/campaigns/${campaignA}/characters/${characterId}`);
  await expect(page.getByRole("heading", { name: "Move declined" })).toBeVisible();
  const fallbackButton = page.getByRole("button", { name: "Move without the pack" });
  await expect(fallbackButton).toBeVisible();
  await fallbackButton.click();

  await page.waitForURL(new RegExp(`/campaigns/${campaignB}/characters/[0-9a-f-]+`));
  await expect(page.getByRole("heading", { name })).toBeVisible();

  await page.goto(`/campaigns/${campaignA}/characters`);
  await expect(page.getByRole("link", { name })).toHaveCount(0);

  await page.goto(`/campaigns/${campaignB}/characters`);
  await expect(page.getByRole("link", { name })).toBeVisible();
});
