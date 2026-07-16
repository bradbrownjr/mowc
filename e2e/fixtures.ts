import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";

/**
 * Invented placeholder content only. No Evil Hat / Michael Sands game text
 * ever enters this repo, tests included (AGENTS.md rule 1). "The Placeholder"
 * playbook is deliberately minimal: empty looks and no gear choices so those
 * wizard steps auto-complete, one ratings line, and one pickable move.
 */
export function makePlaceholderPack(): Record<string, unknown> {
  return {
    id: randomUUID(),
    name: "E2E Placeholder Pack",
    author: "E2E Suite",
    version: "1.0.0",
    playbooks: [
      {
        id: "pb-placeholder",
        name: "The Placeholder",
        blurb: "A stand-in playbook for tests.",
        ratingsLines: [{ charm: 1, cool: 1, sharp: 1, tough: -1, weird: 2 }],
        luckMax: 7,
        harmTrack: { max: 7, unstableAt: 4 },
        looks: [],
        moves: [
          {
            id: "mv-test",
            name: "Test Move",
            trigger: "when you test something",
            rating: "sharp",
            outcomes: null,
            tags: []
          }
        ],
        movesToPick: 1,
        gearChoices: [],
        improvements: [],
        advancedImprovements: [],
        extras: []
      }
    ],
    basicMoves: [],
    monsterTypes: [],
    bystanderTypes: [],
    minionTypes: [],
    locationTypes: [],
    gear: []
  };
}

export interface TestUser {
  email: string;
  password: string;
  displayName: string;
}

/** A fresh, unique account per call so parallel-safe and rerun-safe. */
export function makeUser(): TestUser {
  const id = randomUUID().slice(0, 8);
  return {
    email: `e2e-${id}@example.com`,
    password: "correct-horse-battery",
    displayName: `Tester ${id}`
  };
}

export async function registerViaUi(page: Page, user: TestUser): Promise<void> {
  await page.goto("/register");
  await page.getByLabel("Display name").fill(user.displayName);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Register" }).click();
  await page.waitForURL(/\/campaigns\/?$/);
}

export async function loginViaUi(page: Page, user: TestUser): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/campaigns\/?$/);
}

/** Creates a campaign through the UI and returns its id (read from the URL). */
export async function createCampaignViaUi(page: Page, name: string): Promise<string> {
  await page.goto("/campaigns");
  await page.getByLabel("Campaign name").fill(name);
  await page.getByRole("button", { name: "Create campaign" }).click();
  await page.getByRole("link", { name }).click();
  await page.waitForURL(/\/campaigns\/[0-9a-f-]+\/?$/);
  const match = page.url().match(/\/campaigns\/([0-9a-f-]+)\/?$/);
  if (!match) throw new Error(`could not read campaign id from ${page.url()}`);
  return match[1];
}

/**
 * Seeds a content pack and attaches it to the campaign via the API, sharing
 * the page's logged-in cookie. Pack authoring is not one of the 0.10.1 flows,
 * so it stays out of the UI-driven path; the wizard still reads it exactly as
 * a real Keeper-uploaded pack.
 */
export async function seedAndAttachPack(page: Page, campaignId: string): Promise<string> {
  const packRes = await page.request.post("/api/content-packs", { data: makePlaceholderPack() });
  expect(packRes.ok(), `pack upload failed: ${packRes.status()}`).toBeTruthy();
  const packId = (await packRes.json()).id as string;

  const attachRes = await page.request.patch(`/api/campaigns/${campaignId}`, {
    data: { packIds: [packId] }
  });
  expect(attachRes.ok(), `pack attach failed: ${attachRes.status()}`).toBeTruthy();
  return packId;
}

/** Drives the full character-builder wizard and returns the character id. */
export async function buildCharacterViaUi(page: Page, campaignId: string, name: string): Promise<string> {
  await page.goto(`/campaigns/${campaignId}/characters/new`);

  await page.getByRole("button", { name: "The Placeholder" }).click();
  await page.getByRole("button", { name: "Next" }).click();

  await page.getByRole("button", { name: /Charm/ }).click();
  await page.getByRole("button", { name: "Next" }).click();

  // Looks: empty group set, step auto-completes.
  await page.getByRole("button", { name: "Next" }).click();

  await page.getByRole("button", { name: "Test Move" }).click();
  await page.getByRole("button", { name: "Next" }).click();

  // Gear: no choices, step auto-completes.
  await page.getByRole("button", { name: "Next" }).click();

  await page.getByLabel("Character name").fill(name);
  await page.getByRole("button", { name: "Next" }).click();

  await page.getByRole("button", { name: "Create character" }).click();
  await expect(page.getByRole("heading", { name: "Character created" })).toBeVisible();

  await page.getByRole("link", { name: "View character sheet" }).click();
  await page.waitForURL(/\/characters\/[0-9a-f-]+\/?$/);
  const match = page.url().match(/\/characters\/([0-9a-f-]+)\/?$/);
  if (!match) throw new Error(`could not read character id from ${page.url()}`);
  return match[1];
}
