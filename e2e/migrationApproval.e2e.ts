import { randomUUID } from "node:crypto";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { buildCharacterViaUi, createCampaignViaUi, makePlaceholderPack, makeUser, registerViaUi } from "./fixtures.js";

/**
 * Keeper approval dialog for pack-transfer migration requests
 * (docs/adr/0003-pack-transfer-approval.md, ROADMAP 0.15.3). The hunter-facing
 * fork that decides between the direct `/migrate` call and creating a held
 * request is 0.15.4's job, not built yet, so this test seeds the pending
 * request directly via the API (as instructed) and only drives the Keeper's
 * Approve/Deny UI on the campaign Overview screen.
 */

interface Scaffold {
  hunterContext: BrowserContext;
  hunterPage: Page;
  keeperBContext: BrowserContext;
  keeperBPage: Page;
  campaignAId: string;
  campaignBId: string;
  characterId: string;
  packId: string;
  migrationId: string;
}

/**
 * Builds: Keeper A's campaign (has the placeholder pack, hosts the source
 * character), a hunter seated in both campaigns who owns the character, and
 * Keeper B's campaign (the destination, deliberately WITHOUT the pack
 * attached) with a pending migrate-request already created against it.
 */
async function setupPendingRequest(page: Page, browser: Browser, characterName: string): Promise<Scaffold> {
  const keeperA = makeUser();
  await registerViaUi(page, keeperA);
  const campaignAId = await createCampaignViaUi(page, "Source Table");

  const pack = makePlaceholderPack();
  const packRes = await page.request.post("/api/content-packs", { data: pack });
  expect(packRes.ok(), `pack upload failed: ${packRes.status()}`).toBeTruthy();
  const packId = (await packRes.json()).id as string;
  const attachA = await page.request.patch(`/api/campaigns/${campaignAId}`, { data: { packIds: [packId] } });
  expect(attachA.ok(), `attach to source campaign failed: ${attachA.status()}`).toBeTruthy();

  const hunterContext = await browser.newContext();
  const hunterPage = await hunterContext.newPage();
  const hunter = makeUser();
  await registerViaUi(hunterPage, hunter);

  const inviteA = await page.request.post(`/api/campaigns/${campaignAId}/invites`);
  expect(inviteA.ok(), `invite A creation failed: ${inviteA.status()}`).toBeTruthy();
  const { code: codeA } = (await inviteA.json()) as { code: string };
  const redeemA = await hunterPage.request.post("/api/invites/redeem", { data: { code: codeA } });
  expect(redeemA.ok(), `invite A redemption failed: ${redeemA.status()}`).toBeTruthy();

  const characterId = await buildCharacterViaUi(hunterPage, campaignAId, characterName);

  const keeperBContext = await browser.newContext();
  const keeperBPage = await keeperBContext.newPage();
  const keeperB = makeUser();
  await registerViaUi(keeperBPage, keeperB);
  const campaignBId = await createCampaignViaUi(keeperBPage, "Destination Table");

  const inviteB = await keeperBPage.request.post(`/api/campaigns/${campaignBId}/invites`);
  expect(inviteB.ok(), `invite B creation failed: ${inviteB.status()}`).toBeTruthy();
  const { code: codeB } = (await inviteB.json()) as { code: string };
  const redeemB = await hunterPage.request.post("/api/invites/redeem", { data: { code: codeB } });
  expect(redeemB.ok(), `invite B redemption failed: ${redeemB.status()}`).toBeTruthy();

  const migrationId = randomUUID();
  const createRes = await hunterPage.request.post(`/api/characters/${characterId}/migrate-requests`, {
    data: { migrationId, destinationCampaignId: campaignBId, pack }
  });
  expect(createRes.ok(), `migrate-request create failed: ${createRes.status()}`).toBeTruthy();

  return { hunterContext, hunterPage, keeperBContext, keeperBPage, campaignAId, campaignBId, characterId, packId, migrationId };
}

test("Keeper approves a pending pack-transfer migration request", async ({ page, browser }) => {
  const name = "Wanderer Placeholder";
  const scaffold = await setupPendingRequest(page, browser, name);
  const { hunterContext, keeperBContext, keeperBPage, campaignBId } = scaffold;

  await keeperBPage.goto(`/campaigns/${campaignBId}`);
  await expect(keeperBPage.getByRole("heading", { name: "Pending character moves" })).toBeVisible();
  await expect(keeperBPage.getByText(new RegExp(name))).toBeVisible();
  await expect(keeperBPage.getByText(/E2E Placeholder Pack/)).toBeVisible();

  await keeperBPage.getByRole("button", { name: "Approve" }).click();
  await expect(keeperBPage.getByRole("heading", { name: "Pending character moves" })).toHaveCount(0);

  // The character now belongs to campaign B's roster.
  await keeperBPage.goto(`/campaigns/${campaignBId}/characters`);
  await expect(keeperBPage.getByRole("link", { name })).toBeVisible();

  // The carried pack is attached to campaign B. Keeper B does not own (and
  // has no shared-library access to) the source pack's id, so approval mints
  // a FRESH id for the copy rather than reusing the source packId (ADR 0003
  // Decision 3's private-owner-collision branch); assert on the resulting
  // attachment and pack content, not on id equality with the source.
  const campaignBRes = await keeperBPage.request.get(`/api/campaigns/${campaignBId}`);
  expect(campaignBRes.ok()).toBeTruthy();
  const campaignB = (await campaignBRes.json()) as { packIds: string[] };
  expect(campaignB.packIds).toHaveLength(1);
  const attachedPackRes = await keeperBPage.request.get(`/api/content-packs/${campaignB.packIds[0]}`);
  expect(attachedPackRes.ok()).toBeTruthy();
  const attachedPack = (await attachedPackRes.json()) as { name: string; ownerUserId: string };
  expect(attachedPack.name).toBe("E2E Placeholder Pack");

  await hunterContext.close();
  await keeperBContext.close();
});

test("Keeper denies a pending pack-transfer migration request", async ({ page, browser }) => {
  const name = "Drifter Placeholder";
  const scaffold = await setupPendingRequest(page, browser, name);
  const { hunterContext, keeperBContext, keeperBPage, campaignAId, campaignBId } = scaffold;

  await keeperBPage.goto(`/campaigns/${campaignBId}`);
  await expect(keeperBPage.getByRole("heading", { name: "Pending character moves" })).toBeVisible();

  await keeperBPage.getByRole("button", { name: "Deny" }).click();
  await expect(keeperBPage.getByRole("heading", { name: "Pending character moves" })).toHaveCount(0);

  // The character never moved: still absent from B, still present in A.
  await keeperBPage.goto(`/campaigns/${campaignBId}/characters`);
  await expect(keeperBPage.getByRole("link", { name })).toHaveCount(0);

  await hunterContext.close();
  await keeperBContext.close();

  await page.goto(`/campaigns/${campaignAId}/characters`);
  await expect(page.getByRole("link", { name })).toBeVisible();
});
