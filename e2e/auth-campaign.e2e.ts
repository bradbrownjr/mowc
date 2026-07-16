import { expect, test } from "@playwright/test";
import { createCampaignViaUi, makeUser, registerViaUi } from "./fixtures.js";

test("register, then create and open a campaign", async ({ page }) => {
  const user = makeUser();
  await registerViaUi(page, user);

  // Empty state for a brand-new account.
  await expect(page.getByText("No campaigns yet.")).toBeVisible();

  const name = "The Sleepy Hollow Case";
  const campaignId = await createCampaignViaUi(page, name);

  // On the campaign page: the name shows and the creator is the Keeper.
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByText("Keeper", { exact: true })).toBeVisible();

  // The campaign persists in the list after navigating back.
  await page.goto("/campaigns");
  await expect(page.getByRole("link", { name })).toBeVisible();

  // Deep-linking straight to the campaign still resolves (SPA fallback).
  await page.goto(`/campaigns/${campaignId}`);
  await expect(page.getByRole("heading", { name })).toBeVisible();
});
