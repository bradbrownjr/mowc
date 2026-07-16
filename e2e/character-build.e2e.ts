import { expect, test } from "@playwright/test";
import {
  buildCharacterViaUi,
  createCampaignViaUi,
  makeUser,
  registerViaUi,
  seedAndAttachPack
} from "./fixtures.js";

test("build a character through the wizard", async ({ page }) => {
  const user = makeUser();
  await registerViaUi(page, user);
  const campaignId = await createCampaignViaUi(page, "Monster Hunt");
  await seedAndAttachPack(page, campaignId);

  const name = "Vera Placeholder";
  await buildCharacterViaUi(page, campaignId, name);

  // The sheet renders the new character with its fresh, empty tracks.
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByText("0 of 7")).toBeVisible(); // Harm starts empty.
  await expect(page.getByText("Test Move")).toBeVisible();

  // The character is listed back on the campaign page.
  await page.goto(`/campaigns/${campaignId}`);
  await expect(page.getByRole("link", { name })).toBeVisible();
});
