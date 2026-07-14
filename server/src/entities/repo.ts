import type Database from "better-sqlite3";
import type { SyncEntityType } from "@mowc/shared";

export interface EntityEnvelope {
  id: string;
  campaignId: string;
  type: SyncEntityType;
  payload: Record<string, unknown>;
  rev: number;
  seq: number;
  updatedAt: string;
  updatedBy: string;
  deleted: boolean;
}

interface EntityRow {
  id: string;
  campaign_id: string;
  type: string;
  payload: string;
  rev: number;
  seq: number;
  updated_at: string;
  updated_by: string;
  deleted: number;
}

function toEnvelope(row: EntityRow): EntityEnvelope {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    type: row.type as SyncEntityType,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
    rev: row.rev,
    seq: row.seq,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    deleted: row.deleted === 1
  };
}

export interface CommitParams {
  campaignId: string;
  id: string;
  type: SyncEntityType;
  payload: Record<string, unknown>;
  baseRev: number;
  /** Current server rev of this entity, or undefined for a fresh insert. */
  currentRev: number | undefined;
  updatedAt: string;
  updatedBy: string;
  deleted: boolean;
  opId: string;
}

export interface EntitiesRepo {
  getById(id: string): EntityEnvelope | undefined;
  /** Rows with seq > since, oldest first (docs/SYNC.md pull). */
  listSince(campaignId: string, since: number): EntityEnvelope[];
  isOpApplied(campaignId: string, opId: string): boolean;
  /** Highest seq assigned in this campaign, or 0 when it has no rows. */
  maxSeq(campaignId: string): number;
  /**
   * Assigns the next per-campaign seq, bumps rev, upserts the envelope, and
   * records the opId, all atomically (docs/SYNC.md push steps 4-5). Returns the
   * stored seq and rev.
   */
  commit(params: CommitParams): { seq: number; rev: number };
}

export function createEntitiesRepo(db: Database.Database): EntitiesRepo {
  const selectById = db.prepare("SELECT * FROM entities WHERE id = ?");
  const selectSince = db.prepare(
    "SELECT * FROM entities WHERE campaign_id = ? AND seq > ? ORDER BY seq ASC"
  );
  const selectOp = db.prepare("SELECT 1 FROM applied_ops WHERE campaign_id = ? AND op_id = ?");
  const selectMaxSeq = db.prepare(
    "SELECT COALESCE(MAX(seq), 0) AS max FROM entities WHERE campaign_id = ?"
  );
  const upsert = db.prepare(
    "INSERT INTO entities (id, campaign_id, type, payload, rev, seq, updated_at, updated_by, deleted) " +
      "VALUES (@id, @campaignId, @type, @payload, @rev, @seq, @updatedAt, @updatedBy, @deleted) " +
      "ON CONFLICT(id) DO UPDATE SET type = @type, payload = @payload, rev = @rev, seq = @seq, " +
      "updated_at = @updatedAt, updated_by = @updatedBy, deleted = @deleted"
  );
  const recordOp = db.prepare(
    "INSERT INTO applied_ops (campaign_id, op_id, applied_at) VALUES (?, ?, ?)"
  );

  function nextSeq(campaignId: string): number {
    return (selectMaxSeq.get(campaignId) as { max: number }).max + 1;
  }

  const commitTx = db.transaction((params: CommitParams): { seq: number; rev: number } => {
    const seq = nextSeq(params.campaignId);
    const rev = Math.max(params.currentRev ?? 0, params.baseRev) + 1;
    upsert.run({
      id: params.id,
      campaignId: params.campaignId,
      type: params.type,
      payload: JSON.stringify(params.payload),
      rev,
      seq,
      updatedAt: params.updatedAt,
      updatedBy: params.updatedBy,
      deleted: params.deleted ? 1 : 0
    });
    recordOp.run(params.campaignId, params.opId, new Date().toISOString());
    return { seq, rev };
  });

  return {
    getById(id) {
      const row = selectById.get(id) as EntityRow | undefined;
      return row ? toEnvelope(row) : undefined;
    },

    listSince(campaignId, since) {
      return (selectSince.all(campaignId, since) as EntityRow[]).map(toEnvelope);
    },

    isOpApplied(campaignId, opId) {
      return selectOp.get(campaignId, opId) !== undefined;
    },

    maxSeq(campaignId) {
      return (selectMaxSeq.get(campaignId) as { max: number }).max;
    },

    commit(params) {
      return commitTx(params);
    }
  };
}
