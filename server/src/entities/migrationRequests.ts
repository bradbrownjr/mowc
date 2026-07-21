import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  CharacterSchema,
  type CharacterMigrateResponse,
  type ContentPack,
  type MigrationRequest,
  type MigrationRequestStatus,
  type MigrationRequestSummary,
  type User
} from "@mowc/shared";
import { isAdmin } from "../authz/admin.js";
import type { EntitiesRepo } from "./repo.js";
import { scopeForBucket } from "./router.js";

/**
 * Keeper-approved pack transfer on migration (docs/adr/0003-pack-transfer-approval.md).
 *
 * This module owns the `migration_requests` table AND the one composed
 * transaction that reaches across `content_packs`, `campaigns`, and the existing
 * `entities` + `migrations` move. ADR 0003 section 5 deliberately gives it direct
 * prepared statements against all four tables (rather than composing through
 * three separate repos' public methods) so the whole approve is one atomic unit:
 * a reader can never observe the pack attached without the character having
 * moved, or vice versa.
 */

/** 72h, matching the invite-code default (docs/SECURITY.md section 2). */
const EXPIRY_MS = 72 * 60 * 60 * 1000;

interface MigrationRequestRow {
  migration_id: string;
  source_id: string;
  source_bucket: string;
  destination_campaign_id: string;
  requested_by: string;
  pack_id: string;
  pack_payload: string;
  status: MigrationRequestStatus;
  created_at: string;
  decided_at: string | null;
  decided_by: string | null;
}

/** Full internal record (superset of the wire shape: adds source_bucket/decided_by). */
export interface MigrationRequestRecord {
  migrationId: string;
  sourceId: string;
  sourceBucket: string;
  destinationCampaignId: string;
  requestedBy: string;
  packId: string;
  packName: string;
  status: MigrationRequestStatus;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
}

export interface CreateRequestParams {
  migrationId: string;
  sourceId: string;
  sourceBucket: string;
  destinationCampaignId: string;
  requestedBy: string;
  pack: ContentPack;
  createdAt: string;
}

export interface ApproveParams {
  migrationId: string;
  campaignId: string;
  keeper: User;
  nowIso: string;
}

export type ApproveResult =
  | { kind: "ok"; response: CharacterMigrateResponse }
  | { kind: "notFound" }
  | { kind: "notPending" }
  | { kind: "gone" };

export interface MigrationRequestsRepo {
  /** Retire any pending row older than 72h, so the unique-pending index frees up. */
  sweepExpired(): void;
  findById(migrationId: string): MigrationRequestRecord | undefined;
  findPendingForSource(sourceId: string): MigrationRequestRecord | undefined;
  findLatestForCharacter(sourceId: string): MigrationRequestRecord | undefined;
  create(params: CreateRequestParams): MigrationRequestRecord;
  listPendingForCampaign(campaignId: string): MigrationRequestSummary[];
  /** pending -> denied (Keeper deny or owner cancel). True if a pending row was flipped. */
  setDenied(migrationId: string, decidedBy: string, decidedAt: string): boolean;
  approve(params: ApproveParams): ApproveResult;
}

/** Maps the full record to the owner-facing wire shape (drops internal columns). */
export function toMigrationRequestWire(record: MigrationRequestRecord): MigrationRequest {
  return {
    migrationId: record.migrationId,
    sourceId: record.sourceId,
    destinationCampaignId: record.destinationCampaignId,
    status: record.status,
    packId: record.packId,
    packName: record.packName,
    requestedBy: record.requestedBy,
    createdAt: record.createdAt,
    decidedAt: record.decidedAt
  };
}

/** Thrown inside the approve transaction so it rolls back and the router 409s. */
class CharacterGoneError extends Error {}

export function createMigrationRequestsRepo(
  db: Database.Database,
  entitiesRepo: EntitiesRepo,
  adminEmail: string | undefined
): MigrationRequestsRepo {
  const selectById = db.prepare("SELECT * FROM migration_requests WHERE migration_id = ?");
  const selectPendingForSource = db.prepare(
    "SELECT * FROM migration_requests WHERE source_id = ? AND status = 'pending'"
  );
  const selectLatestForCharacter = db.prepare(
    "SELECT * FROM migration_requests WHERE source_id = ? ORDER BY created_at DESC LIMIT 1"
  );
  const selectPendingForCampaign = db.prepare(
    "SELECT * FROM migration_requests WHERE destination_campaign_id = ? AND status = 'pending' " +
      "ORDER BY created_at ASC"
  );
  const insertRequest = db.prepare(
    "INSERT INTO migration_requests " +
      "(migration_id, source_id, source_bucket, destination_campaign_id, requested_by, pack_id, pack_payload, created_at) " +
      "VALUES (@migrationId, @sourceId, @sourceBucket, @destinationCampaignId, @requestedBy, @packId, @packPayload, @createdAt)"
  );
  const expireStmt = db.prepare(
    "UPDATE migration_requests SET status = 'expired' WHERE status = 'pending' AND created_at < ?"
  );
  const setDeniedStmt = db.prepare(
    "UPDATE migration_requests SET status = 'denied', decided_at = ?, decided_by = ? " +
      "WHERE migration_id = ? AND status = 'pending'"
  );
  const setApprovedStmt = db.prepare(
    "UPDATE migration_requests SET status = 'approved', decided_at = ?, decided_by = ? WHERE migration_id = ?"
  );

  // content_packs statements. `insertPack` mirrors server/src/api/contentPacks.ts
  // deliberately (ADR 0003 section 5): held here so the create-or-dedupe runs
  // inside the same transaction as the attach and the move.
  const selectPackReadable = db.prepare(
    "SELECT 1 FROM content_packs WHERE id = ? AND (owner_user_id = ? OR visibility = 'shared')"
  );
  const selectPackById = db.prepare("SELECT 1 FROM content_packs WHERE id = ?");
  const insertPack = db.prepare(
    "INSERT INTO content_packs (id, owner_user_id, name, author, version, payload, visibility, created_at, updated_at) " +
      "VALUES (@id, @ownerUserId, @name, @author, @version, @payload, @visibility, @createdAt, @updatedAt)"
  );

  // campaigns statements (attach the resolved pack to Campaign.packIds).
  const selectCampaignPackIds = db.prepare("SELECT pack_ids FROM campaigns WHERE id = ?");
  const updateCampaignPackIds = db.prepare(
    "UPDATE campaigns SET pack_ids = ?, updated_at = ? WHERE id = ?"
  );

  const selectDisplayName = db.prepare("SELECT display_name FROM users WHERE id = ?");

  function sweepExpired(): void {
    expireStmt.run(new Date(Date.now() - EXPIRY_MS).toISOString());
  }

  function toRecord(row: MigrationRequestRow): MigrationRequestRecord {
    const pack = JSON.parse(row.pack_payload) as { name?: unknown };
    return {
      migrationId: row.migration_id,
      sourceId: row.source_id,
      sourceBucket: row.source_bucket,
      destinationCampaignId: row.destination_campaign_id,
      requestedBy: row.requested_by,
      packId: row.pack_id,
      packName: typeof pack.name === "string" ? pack.name : "",
      status: row.status,
      createdAt: row.created_at,
      decidedAt: row.decided_at,
      decidedBy: row.decided_by
    };
  }

  function findById(migrationId: string): MigrationRequestRecord | undefined {
    const row = selectById.get(migrationId) as MigrationRequestRow | undefined;
    return row ? toRecord(row) : undefined;
  }

  function packInsertParams(pack: ContentPack, ownerUserId: string, visibility: string, nowIso: string) {
    return {
      id: pack.id,
      ownerUserId,
      name: pack.name,
      author: pack.author,
      version: pack.version,
      payload: JSON.stringify(pack),
      visibility,
      createdAt: nowIso,
      updatedAt: nowIso
    };
  }

  // ADR 0003 section 3: dedupe-by-id when the Keeper already owns/can read a pack
  // with this id; mint a fresh id on a private-collision; otherwise insert with
  // the id preserved. The new row is always owned by the approving Keeper.
  function resolvePackId(pack: ContentPack, keeper: User, nowIso: string): string {
    if (selectPackReadable.get(pack.id, keeper.id)) {
      return pack.id;
    }
    const visibility = isAdmin(keeper, adminEmail) ? "shared" : "private";
    if (selectPackById.get(pack.id)) {
      const freshId = randomUUID();
      insertPack.run(packInsertParams({ ...pack, id: freshId }, keeper.id, visibility, nowIso));
      return freshId;
    }
    insertPack.run(packInsertParams(pack, keeper.id, visibility, nowIso));
    return pack.id;
  }

  const approveTx = db.transaction(
    (row: MigrationRequestRow, keeper: User, nowIso: string): CharacterMigrateResponse => {
      // Load the character FRESH, not a request-time snapshot: it may have moved
      // or been deleted while the request sat pending (ADR 0003 section 5 step 2).
      const character = entitiesRepo.getById(row.source_id);
      if (!character || character.deleted || character.type !== "character") {
        throw new CharacterGoneError();
      }
      const sourceBucket = character.campaignId;
      const destBucket = row.destination_campaign_id;
      if (destBucket === sourceBucket) {
        // Already in the destination (moved there by other means); can't migrate.
        throw new CharacterGoneError();
      }

      const pack = JSON.parse(row.pack_payload) as ContentPack;
      const resolvedPackId = resolvePackId(pack, keeper, nowIso);

      const campRow = selectCampaignPackIds.get(destBucket) as { pack_ids: string } | undefined;
      if (campRow) {
        const packIds = JSON.parse(campRow.pack_ids) as string[];
        if (!packIds.includes(resolvedPackId)) {
          packIds.push(resolvedPackId);
          updateCampaignPackIds.run(JSON.stringify(packIds), nowIso, destBucket);
        }
      }

      const newId = randomUUID();
      const destPayload = { ...character.payload, id: newId, campaignId: destBucket };
      const validated = CharacterSchema.strict().safeParse(destPayload);
      if (!validated.success) {
        throw new CharacterGoneError();
      }

      const migration = entitiesRepo.migrateCharacter({
        migrationId: row.migration_id,
        sourceId: character.id,
        sourceBucket,
        sourcePayload: character.payload,
        sourceRev: character.rev,
        newId,
        destBucket,
        destPayload: validated.data as Record<string, unknown>,
        requestedBy: row.requested_by,
        updatedAt: nowIso
      });

      setApprovedStmt.run(nowIso, keeper.id, row.migration_id);

      return {
        newId: migration.newId,
        sourceId: migration.sourceId,
        sourceScope: scopeForBucket(migration.sourceBucket, migration.requestedBy),
        destScope: scopeForBucket(migration.destBucket, migration.requestedBy)
      };
    }
  );

  return {
    sweepExpired,

    findById,

    findPendingForSource(sourceId) {
      const row = selectPendingForSource.get(sourceId) as MigrationRequestRow | undefined;
      return row ? toRecord(row) : undefined;
    },

    findLatestForCharacter(sourceId) {
      const row = selectLatestForCharacter.get(sourceId) as MigrationRequestRow | undefined;
      return row ? toRecord(row) : undefined;
    },

    create(params) {
      insertRequest.run({
        migrationId: params.migrationId,
        sourceId: params.sourceId,
        sourceBucket: params.sourceBucket,
        destinationCampaignId: params.destinationCampaignId,
        requestedBy: params.requestedBy,
        packId: params.pack.id,
        packPayload: JSON.stringify(params.pack),
        createdAt: params.createdAt
      });
      return findById(params.migrationId)!;
    },

    listPendingForCampaign(campaignId) {
      const rows = selectPendingForCampaign.all(campaignId) as MigrationRequestRow[];
      return rows.map((row) => {
        const record = toRecord(row);
        const character = entitiesRepo.getById(row.source_id);
        const nameRow = selectDisplayName.get(row.requested_by) as
          | { display_name: string }
          | undefined;
        return {
          ...toMigrationRequestWire(record),
          characterName:
            typeof character?.payload.name === "string" ? (character.payload.name as string) : "",
          requestedByDisplayName: nameRow?.display_name ?? ""
        };
      });
    },

    setDenied(migrationId, decidedBy, decidedAt) {
      return setDeniedStmt.run(decidedAt, decidedBy, migrationId).changes > 0;
    },

    approve({ migrationId, campaignId, keeper, nowIso }) {
      sweepExpired();
      // Idempotent replay: if the move already completed under this migrationId,
      // return its stored result (ADR 0002's findMigration short-circuit) so a
      // re-approve is a no-op rather than a 409 (ADR 0003 section 5 idempotency).
      const done = entitiesRepo.findMigration(migrationId);
      if (done) {
        return {
          kind: "ok",
          response: {
            newId: done.newId,
            sourceId: done.sourceId,
            sourceScope: scopeForBucket(done.sourceBucket, done.requestedBy),
            destScope: scopeForBucket(done.destBucket, done.requestedBy)
          }
        };
      }
      const row = selectById.get(migrationId) as MigrationRequestRow | undefined;
      if (!row || row.destination_campaign_id !== campaignId) {
        return { kind: "notFound" };
      }
      if (row.status !== "pending") {
        return { kind: "notPending" };
      }
      try {
        return { kind: "ok", response: approveTx(row, keeper, nowIso) };
      } catch (err) {
        if (err instanceof CharacterGoneError) {
          return { kind: "gone" };
        }
        throw err;
      }
    }
  };
}
