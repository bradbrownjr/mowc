import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { generateToken, hashToken } from "../auth/security.js";

/** 72 hours, default (docs/SECURITY.md section 2). */
const INVITE_TTL_MS = 72 * 60 * 60 * 1000;

interface InviteRow {
  id: string;
  campaign_id: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
}

export interface InviteSummary {
  id: string;
  campaignId: string;
  createdAt: string;
  expiresAt: string;
  revoked: boolean;
}

function toSummary(row: InviteRow): InviteSummary {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revoked: row.revoked_at !== null
  };
}

export interface InvitesRepo {
  /** The raw code is returned once and never persisted. */
  create(campaignId: string, createdBy: string): { invite: InviteSummary; code: string };
  listForCampaign(campaignId: string): InviteSummary[];
  revoke(campaignId: string, inviteId: string): boolean;
  /** Campaign id for a valid (unexpired, unrevoked) code, else undefined. */
  campaignForCode(code: string): string | undefined;
}

export function createInvitesRepo(db: Database.Database): InvitesRepo {
  const insertInvite = db.prepare(
    "INSERT INTO invites (id, campaign_id, code_hash, created_by, created_at, expires_at) " +
      "VALUES (@id, @campaignId, @codeHash, @createdBy, @now, @expiresAt)"
  );
  const selectForCampaign = db.prepare(
    "SELECT id, campaign_id, created_at, expires_at, revoked_at FROM invites " +
      "WHERE campaign_id = ? ORDER BY created_at DESC"
  );
  const selectByCampaignAndId = db.prepare(
    "SELECT id, campaign_id, created_at, expires_at, revoked_at FROM invites " +
      "WHERE campaign_id = ? AND id = ?"
  );
  const revokeById = db.prepare("UPDATE invites SET revoked_at = ? WHERE campaign_id = ? AND id = ?");
  const selectByCodeHash = db.prepare(
    "SELECT id, campaign_id, created_at, expires_at, revoked_at FROM invites WHERE code_hash = ?"
  );

  return {
    create(campaignId, createdBy) {
      const id = randomUUID();
      const code = generateToken(16);
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();
      insertInvite.run({ id, campaignId, codeHash: hashToken(code), createdBy, now, expiresAt });
      return {
        invite: { id, campaignId, createdAt: now, expiresAt, revoked: false },
        code
      };
    },

    listForCampaign(campaignId) {
      return (selectForCampaign.all(campaignId) as InviteRow[]).map(toSummary);
    },

    revoke(campaignId, inviteId) {
      const existing = selectByCampaignAndId.get(campaignId, inviteId) as InviteRow | undefined;
      if (!existing || existing.revoked_at !== null) {
        return false;
      }
      revokeById.run(new Date().toISOString(), campaignId, inviteId);
      return true;
    },

    campaignForCode(code) {
      const row = selectByCodeHash.get(hashToken(code)) as InviteRow | undefined;
      if (!row || row.revoked_at !== null || new Date(row.expires_at).getTime() < Date.now()) {
        return undefined;
      }
      return row.campaign_id;
    }
  };
}
