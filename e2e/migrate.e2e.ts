import { expect, test } from "@playwright/test";
import {
  buildCharacterViaUi,
  createCampaignViaUi,
  makeUser,
  registerViaUi,
  seedAndAttachPack
} from "./fixtures.js";

/**
 * ADR 0002 / ROADMAP 0.14.4: a character moves between campaigns via the
 * "Move character" control on its sheet. The server tombstones the source row
 * and mints a fresh id in the destination bucket; the client re-points local
 * storage and navigates to the new sheet under the destination campaign.
 */
test("migrate a character from one campaign to another", async ({ page }) => {
  const user = makeUser();
  await registerViaUi(page, user);

  const campaignA = await createCampaignViaUi(page, "First Table");
  const campaignB = await createCampaignViaUi(page, "Second Table");

  // Same pack attached to both, so the destination sheet can resolve the
  // character's playbook and moves (ADR 0002 open risk 3).
  const packId = await seedAndAttachPack(page, campaignA);
  const attachB = await page.request.patch(`/api/campaigns/${campaignB}`, { data: { packIds: [packId] } });
  expect(attachB.ok(), `attach to B failed: ${attachB.status()}`).toBeTruthy();

  const name = "Wanderer Placeholder";
  await buildCharacterViaUi(page, campaignA, name);
  await expect(page.getByRole("heading", { name })).toBeVisible();

  // The control proactively flushes the source scope on mount; the Move button
  // stays disabled until that create op drains from the local oplog (ADR 0002
  // clean-scope precondition), then re-enables reactively. Wait on that real
  // state rather than a bare timeout.
  await page.getByLabel("Destination").selectOption({ label: "Second Table" });
  const moveButton = page.getByRole("button", { name: "Move character" });
  await expect(moveButton).toBeEnabled({ timeout: 15_000 });
  await moveButton.click();

  // Landed on the destination campaign's sheet under a fresh id, progress intact.
  await page.waitForURL(new RegExp(`/campaigns/${campaignB}/characters/[0-9a-f-]+`));
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByText("Test Move")).toBeVisible();

  // The character no longer appears in the source campaign's roster.
  await page.goto(`/campaigns/${campaignA}/characters`);
  await expect(page.getByRole("link", { name })).toHaveCount(0);

  // It does appear in the destination campaign's roster.
  await page.goto(`/campaigns/${campaignB}/characters`);
  await expect(page.getByRole("link", { name })).toBeVisible();
});
