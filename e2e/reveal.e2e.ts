import { expect, test } from "@playwright/test";
import { createCampaignViaUi, makeUser, registerViaUi } from "./fixtures.js";

/**
 * The share/reveal control end to end (ROADMAP 0.5.5): a Keeper-owned
 * entity stays invisible to a hunter until the Keeper flips `revealed`,
 * exercising the Stage 0 sync/authz generalization's pull-side filtering
 * (server/src/entities/router.ts) from the actual UI, not just a unit test.
 * Invite creation/redemption goes through the API directly (sharing each
 * page's own authenticated cookies) since invite UX itself is not what
 * this test is about.
 */
test("Keeper reveals a location to a hunter", async ({ page, browser }) => {
  const keeper = makeUser();
  await registerViaUi(page, keeper);
  const campaignId = await createCampaignViaUi(page, "Reveal Case");

  const hunterContext = await browser.newContext();
  const hunterPage = await hunterContext.newPage();
  const hunter = makeUser();
  await registerViaUi(hunterPage, hunter);

  const inviteRes = await page.request.post(`/api/campaigns/${campaignId}/invites`);
  expect(inviteRes.ok(), `invite creation failed: ${inviteRes.status()}`).toBeTruthy();
  const { code } = (await inviteRes.json()) as { code: string };
  const redeemRes = await hunterPage.request.post("/api/invites/redeem", { data: { code } });
  expect(redeemRes.ok(), `invite redemption failed: ${redeemRes.status()}`).toBeTruthy();

  // Keeper creates a Location; it starts hidden from hunters (revealed: false).
  await page.goto(`/campaigns/${campaignId}/locations/new`);
  await page.getByLabel("Name *").fill("The Placeholder Diner");
  await page.getByRole("button", { name: "Create location" }).click();
  await expect(page.getByRole("heading", { name: "Location created" })).toBeVisible();
  await page.getByRole("link", { name: "View location" }).click();
  await page.waitForURL(/\/locations\/[0-9a-f-]+\/?$/);
  const match = page.url().match(/\/locations\/([0-9a-f-]+)\/?$/);
  if (!match) throw new Error(`could not read location id from ${page.url()}`);
  const locationId = match[1];

  await expect(page.getByRole("button", { name: "Hidden from hunters" })).toBeVisible();

  // The hunter cannot see it yet: pull already filters unrevealed rows
  // out server-side, so it never lands in the hunter's local IndexedDB.
  await hunterPage.goto(`/campaigns/${campaignId}/locations/${locationId}`);
  await expect(hunterPage.getByText("Location not found.")).toBeVisible();

  // Keeper reveals it. The local optimistic write lands immediately, but
  // the network push is debounced (schedulePush, ~2s), so wait for the
  // server to actually have revealed: true before the hunter pulls.
  await page.getByRole("button", { name: "Hidden from hunters" }).click();
  await expect(page.getByRole("button", { name: "Revealed to hunters" })).toBeVisible();

  const serverRevealed = async (): Promise<boolean | null> => {
    const res = await page.request.get(`/api/sync/${campaignId}?since=0`);
    if (!res.ok()) return null;
    const body = (await res.json()) as { rows: { id: string; payload: { revealed?: boolean } }[] };
    return body.rows.find((row) => row.id === locationId)?.payload.revealed ?? null;
  };
  await expect.poll(serverRevealed, { timeout: 15_000, message: "reveal never reached the server" }).toBe(true);

  // The hunter's next pull now includes it.
  await hunterPage.reload();
  await expect(hunterPage.getByRole("heading", { name: "The Placeholder Diner" })).toBeVisible();

  await hunterContext.close();
});
