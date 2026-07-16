import { expect, test } from "@playwright/test";
import {
  buildCharacterViaUi,
  createCampaignViaUi,
  loginViaUi,
  makeUser,
  registerViaUi,
  seedAndAttachPack
} from "./fixtures.js";

/**
 * The offline-first guarantee end to end (AGENTS.md rule 2, docs/SYNC.md):
 * mutate a character with the network cut, then reconnect and confirm the
 * change reaches the server and a fresh client. Reconnect flushes queued
 * ops via the window 'online' listener registered by startSync().
 */
test("edit a character offline, then sync on reconnect", async ({ page, context, browser }) => {
  const user = makeUser();
  await registerViaUi(page, user);
  const campaignId = await createCampaignViaUi(page, "Offline Case");
  await seedAndAttachPack(page, campaignId);
  const name = "Grip Placeholder";
  const characterId = await buildCharacterViaUi(page, campaignId, name);

  // On the sheet, Harm starts empty.
  await expect(page.getByText("0 of 7")).toBeVisible();

  // Let the initial (online) create push land before cutting the network,
  // so only the offline edit is in flight on reconnect.
  const serverHarm = async (): Promise<number | null> => {
    const res = await page.request.get(`/api/sync/${campaignId}?since=0`);
    if (!res.ok()) return null;
    const body = (await res.json()) as { rows: { id: string; payload: { harm?: number } }[] };
    return body.rows.find((row) => row.id === characterId)?.payload.harm ?? null;
  };
  await expect.poll(serverHarm, { timeout: 15_000 }).toBe(0);

  // Cut the network and mutate: the write must apply against local storage.
  await context.setOffline(true);
  await page.getByRole("button", { name: "Mark harm 3 of 7" }).click();
  await expect(page.getByText("3 of 7")).toBeVisible();

  // Reconnect: the 'online' listener flushes the queued op to the server.
  await context.setOffline(false);
  await expect
    .poll(serverHarm, { timeout: 15_000, message: "offline harm edit never reached the server" })
    .toBe(3);

  // A brand-new client (separate context: fresh cookies + fresh IndexedDB)
  // pulls the synced value from the server.
  const fresh = await browser.newContext();
  const freshPage = await fresh.newPage();
  await loginViaUi(freshPage, user);
  await freshPage.goto(`/campaigns/${campaignId}/characters/${characterId}`);
  await expect(freshPage.getByText("3 of 7")).toBeVisible();
  await fresh.close();
});
