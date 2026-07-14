import Dexie, { type Table } from "dexie";
import type { SyncEntityType } from "@mowc/shared";

/**
 * Local mirror of the server sync envelope (docs/SYNC.md "Client storage").
 * `payload` is the parsed entity object; `deleted` rows are hidden by the UI.
 */
export interface LocalEntity {
  id: string;
  campaignId: string;
  type: SyncEntityType;
  payload: Record<string, unknown>;
  rev: number;
  seq: number;
  updatedAt: string;
  deleted: boolean;
}

/**
 * A pending local mutation queued for push. `patch` holds only the changed
 * top-level fields (the full payload for a new entity); `campaignId` lets a
 * push target one campaign; `ts` is the write time used as the LWW key.
 */
export interface OplogEntry {
  opId: string;
  entityId: string;
  campaignId: string;
  type: SyncEntityType;
  baseRev: number;
  patch: Record<string, unknown>;
  deleted: boolean;
  ts: string;
}

/** Per-campaign cursor: the highest server seq already pulled. */
export interface SyncStateRow {
  campaignId: string;
  lastServerSeq: number;
}

export class MowcDb extends Dexie {
  entities!: Table<LocalEntity, string>;
  oplog!: Table<OplogEntry, string>;
  syncState!: Table<SyncStateRow, string>;

  constructor(name = "mowc") {
    super(name);
    this.version(1).stores({
      entities: "id, campaignId, [campaignId+type]",
      oplog: "opId, entityId, campaignId",
      syncState: "campaignId"
    });
  }
}

export const db = new MowcDb();
