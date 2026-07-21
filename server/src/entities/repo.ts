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

/** A recorded character migration (docs/adr/0002-character-migration.md). */
export interface MigrationRecord {
  migrationId: string;
  sourceId: string;
  newId: string;
  sourceBucket: string;
  destBucket: string;
  requestedBy: string;
  createdAt: string;
}

export interface MigrateCharacterParams {
  migrationId: string;
  /** The retired character id, tombstoned in place in the source bucket. */
  sourceId: string;
  /** Source envelope bucket (campaign id, or the owner user id for standalone). */
  sourceBucket: string;
  /** The source row's payload, carried unchanged onto its tombstone. */
  sourcePayload: Record<string, unknown>;
  /** Current server rev of the source row; the tombstone gets sourceRev + 1. */
  sourceRev: number;
  /** Fresh id for the character in the destination bucket. */
  newId: string;
  /** Destination envelope bucket (campaign id, or the owner user id for standalone). */
  destBucket: string;
  /** The validated payload for the destination row (id/campaignId already forced). */
  destPayload: Record<string, unknown>;
  requestedBy: string;
  updatedAt: string;
}

export interface EntitiesRepo {
  getById(id: string): EntityEnvelope | undefined;
  /** Rows with seq > since, oldest first (docs/SYNC.md pull). */
  listSince(campaignId: string, since: number): EntityEnvelope[];
  isOpApplied(campaignId: string, opId: string): boolean;
  /**
   * Deletes applied-op idempotency rows older than `beforeIso`, bounding a
   * table that would otherwise grow forever on a long-running campaign
   * (docs/SYNC.md: applied_ops is pruned after 30 days). Returns the number
   * of rows removed. Safe to run past the point a replayed batch could arrive.
   */
  pruneAppliedOps(beforeIso: string): number;
  /** Highest seq assigned in this campaign, or 0 when it has no rows. */
  maxSeq(campaignId: string): number;
  /**
   * Assigns the next per-campaign seq, bumps rev, upserts the envelope, and
   * records the opId, all atomically (docs/SYNC.md push steps 4-5). Returns the
   * stored seq and rev.
   */
  commit(params: CommitParams): { seq: number; rev: number };
  /** A previously completed migration by its client id, or undefined. */
  findMigration(migrationId: string): MigrationRecord | undefined;
  /**
   * Moves a character between buckets in ONE transaction: tombstones the source
   * row (next source-bucket seq), inserts a fresh destination row (next
   * dest-bucket seq, rev 1), and records the migration for idempotency
   * (docs/adr/0002-character-migration.md). No id ever lives in two buckets.
   */
  migrateCharacter(params: MigrateCharacterParams): MigrationRecord;
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
  const pruneOps = db.prepare("DELETE FROM applied_ops WHERE applied_at < ?");
  const selectMigration = db.prepare("SELECT * FROM migrations WHERE migration_id = ?");
  const insertMigration = db.prepare(
    "INSERT INTO migrations (migration_id, source_id, new_id, source_bucket, dest_bucket, requested_by, created_at) " +
      "VALUES (@migrationId, @sourceId, @newId, @sourceBucket, @destBucket, @requestedBy, @createdAt)"
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

  function toMigrationRecord(row: {
    migration_id: string;
    source_id: string;
    new_id: string;
    source_bucket: string;
    dest_bucket: string;
    requested_by: string;
    created_at: string;
  }): MigrationRecord {
    return {
      migrationId: row.migration_id,
      sourceId: row.source_id,
      newId: row.new_id,
      sourceBucket: row.source_bucket,
      destBucket: row.dest_bucket,
      requestedBy: row.requested_by,
      createdAt: row.created_at
    };
  }

  const migrateTx = db.transaction((params: MigrateCharacterParams): MigrationRecord => {
    // 1. Tombstone the source row in the source bucket with a fresh seq, so the
    //    source Keeper's (and every source-bucket device's) next pull sees the
    //    removal. Its payload is carried unchanged; only `deleted` flips.
    upsert.run({
      id: params.sourceId,
      campaignId: params.sourceBucket,
      type: "character",
      payload: JSON.stringify(params.sourcePayload),
      rev: params.sourceRev + 1,
      seq: nextSeq(params.sourceBucket),
      updatedAt: params.updatedAt,
      updatedBy: params.requestedBy,
      deleted: 1
    });
    // 2. Insert the fresh destination row (new id, rev 1) in the dest bucket.
    upsert.run({
      id: params.newId,
      campaignId: params.destBucket,
      type: "character",
      payload: JSON.stringify(params.destPayload),
      rev: 1,
      seq: nextSeq(params.destBucket),
      updatedAt: params.updatedAt,
      updatedBy: params.requestedBy,
      deleted: 0
    });
    // Seed applied_ops with the two deterministic op ids so even a hand-crafted
    // sync replay of these synthetic ops is inert (ADR 0002 belt-and-suspenders;
    // the migrations row below is the primary idempotency guard).
    recordOp.run(params.sourceBucket, `migrate:${params.migrationId}:src`, params.updatedAt);
    recordOp.run(params.destBucket, `migrate:${params.migrationId}:dst`, params.updatedAt);
    // 3. Record the migration. Its PRIMARY KEY is the final backstop: a racing
    //    duplicate conflicts here, rolls the whole transaction back, and the
    //    caller falls back to findMigration and returns the first result.
    insertMigration.run({
      migrationId: params.migrationId,
      sourceId: params.sourceId,
      newId: params.newId,
      sourceBucket: params.sourceBucket,
      destBucket: params.destBucket,
      requestedBy: params.requestedBy,
      createdAt: params.updatedAt
    });
    return {
      migrationId: params.migrationId,
      sourceId: params.sourceId,
      newId: params.newId,
      sourceBucket: params.sourceBucket,
      destBucket: params.destBucket,
      requestedBy: params.requestedBy,
      createdAt: params.updatedAt
    };
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

    pruneAppliedOps(beforeIso) {
      return pruneOps.run(beforeIso).changes;
    },

    maxSeq(campaignId) {
      return (selectMaxSeq.get(campaignId) as { max: number }).max;
    },

    commit(params) {
      return commitTx(params);
    },

    findMigration(migrationId) {
      const row = selectMigration.get(migrationId) as
        | Parameters<typeof toMigrationRecord>[0]
        | undefined;
      return row ? toMigrationRecord(row) : undefined;
    },

    migrateCharacter(params) {
      return migrateTx(params);
    }
  };
}
