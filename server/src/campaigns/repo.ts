import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { Campaign, CampaignUpdateInput, SeatRole } from "@mowc/shared";

interface CampaignRow {
  id: string;
  name: string;
  keeper_user_id: string;
  pack_ids: string;
  settings: string;
  theme: string;
  created_at: string;
  updated_at: string;
}

function toCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    name: row.name,
    keeperUserId: row.keeper_user_id,
    packIds: JSON.parse(row.pack_ids) as string[],
    settings: JSON.parse(row.settings) as Record<string, unknown>,
    theme: row.theme
  };
}

export interface CampaignsRepo {
  create(params: { name: string; keeperUserId: string }): Campaign;
  listForUser(userId: string): Campaign[];
  findById(id: string): Campaign | undefined;
  hasSeat(campaignId: string, userId: string): boolean;
  /** Canonical role from the seats table; undefined when the user has no seat. */
  roleOf(campaignId: string, userId: string): SeatRole | undefined;
  /** Idempotent: a no-op if the user already holds a seat. */
  addHunterSeat(campaignId: string, userId: string): void;
  update(id: string, patch: CampaignUpdateInput): Campaign | undefined;
  remove(id: string): boolean;
}

export function createCampaignsRepo(db: Database.Database): CampaignsRepo {
  const insertCampaign = db.prepare(
    "INSERT INTO campaigns (id, name, keeper_user_id, pack_ids, settings, theme, created_at, updated_at) " +
      "VALUES (@id, @name, @keeperUserId, @packIds, @settings, @theme, @now, @now)"
  );
  const insertSeat = db.prepare(
    "INSERT INTO seats (campaign_id, user_id, role, created_at) VALUES (?, ?, ?, ?)"
  );
  const selectById = db.prepare("SELECT * FROM campaigns WHERE id = ?");
  const selectForUser = db.prepare(
    "SELECT c.* FROM campaigns c JOIN seats s ON s.campaign_id = c.id " +
      "WHERE s.user_id = ? ORDER BY c.updated_at DESC"
  );
  const selectSeat = db.prepare("SELECT 1 FROM seats WHERE campaign_id = ? AND user_id = ?");
  const selectRole = db.prepare("SELECT role FROM seats WHERE campaign_id = ? AND user_id = ?");
  const updateCampaign = db.prepare(
    "UPDATE campaigns SET name = @name, pack_ids = @packIds, settings = @settings, " +
      "theme = @theme, updated_at = @updatedAt WHERE id = @id"
  );
  const deleteCampaign = db.prepare("DELETE FROM campaigns WHERE id = ?");

  function createSeat(campaignId: string, userId: string, role: SeatRole): void {
    insertSeat.run(campaignId, userId, role, new Date().toISOString());
  }

  return {
    create({ name, keeperUserId }) {
      const id = randomUUID();
      const now = new Date().toISOString();
      const campaign: Campaign = { id, name, keeperUserId, packIds: [], settings: {}, theme: "default" };
      const run = db.transaction(() => {
        insertCampaign.run({
          id,
          name,
          keeperUserId,
          packIds: JSON.stringify(campaign.packIds),
          settings: JSON.stringify(campaign.settings),
          theme: campaign.theme,
          now
        });
        createSeat(id, keeperUserId, "keeper");
      });
      run();
      return campaign;
    },

    listForUser(userId) {
      return (selectForUser.all(userId) as CampaignRow[]).map(toCampaign);
    },

    findById(id) {
      const row = selectById.get(id) as CampaignRow | undefined;
      return row ? toCampaign(row) : undefined;
    },

    hasSeat(campaignId, userId) {
      return selectSeat.get(campaignId, userId) !== undefined;
    },

    roleOf(campaignId, userId) {
      const row = selectRole.get(campaignId, userId) as { role: SeatRole } | undefined;
      return row?.role;
    },

    addHunterSeat(campaignId, userId) {
      if (selectSeat.get(campaignId, userId) !== undefined) {
        return;
      }
      createSeat(campaignId, userId, "hunter");
    },

    update(id, patch) {
      const existing = selectById.get(id) as CampaignRow | undefined;
      if (!existing) {
        return undefined;
      }
      const merged: CampaignRow = {
        ...existing,
        name: patch.name ?? existing.name,
        pack_ids: patch.packIds ? JSON.stringify(patch.packIds) : existing.pack_ids,
        settings: patch.settings ? JSON.stringify(patch.settings) : existing.settings,
        theme: patch.theme ?? existing.theme,
        updated_at: new Date().toISOString()
      };
      updateCampaign.run({
        id,
        name: merged.name,
        packIds: merged.pack_ids,
        settings: merged.settings,
        theme: merged.theme,
        updatedAt: merged.updated_at
      });
      return toCampaign(merged);
    },

    remove(id) {
      return deleteCampaign.run(id).changes > 0;
    }
  };
}
