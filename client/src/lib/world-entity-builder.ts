/**
 * Pure state-assembly and payload-building logic for Minion, Bystander, and
 * Location creation (single-screen forms, not multi-step wizards).
 * Extracted so it can be unit-tested without a browser.
 */
import type { Bystander, ContentPack, Location, Minion, MonsterAttack, ArchetypeDef } from "@mowc/shared";

/** All minion types across every attached content pack, in pack order. */
export function flattenMinionTypes(packs: ContentPack[]): ArchetypeDef[] {
  return packs.flatMap((pack) => pack.minionTypes);
}

/** All bystander types across every attached content pack, in pack order. */
export function flattenBystanderTypes(packs: ContentPack[]): ArchetypeDef[] {
  return packs.flatMap((pack) => pack.bystanderTypes);
}

/** Assembles the full Minion payload from form state. */
export function buildMinionPayload(params: {
  id: string;
  campaignId: string;
  name: string;
  typeId: string | null;
  motivation: string;
  attacks: MonsterAttack[];
  armor: number;
  harmCapacity: number;
}): Minion {
  const { id, campaignId, name, typeId, motivation, attacks, armor, harmCapacity } = params;
  return {
    id,
    campaignId,
    name: name.trim(),
    typeId: typeId || null,
    motivation: motivation.trim(),
    attacks,
    armor: Math.max(0, armor),
    harmCapacity: Math.max(0, harmCapacity),
    harmTaken: 0,
    revealed: false
  };
}

/** Assembles the full Bystander payload from form state. */
export function buildBystanderPayload(params: {
  id: string;
  campaignId: string;
  name: string;
  typeId: string | null;
  motivation: string;
  notes: string;
}): Bystander {
  const { id, campaignId, name, typeId, motivation, notes } = params;
  return {
    id,
    campaignId,
    name: name.trim(),
    typeId: typeId || null,
    motivation: motivation.trim(),
    notes: notes.trim(),
    revealed: false
  };
}

/** Assembles the full Location payload from form state. */
export function buildLocationPayload(params: {
  id: string;
  campaignId: string;
  name: string;
  description: string;
  mapNotes: string;
}): Location {
  const { id, campaignId, name, description, mapNotes } = params;
  return {
    id,
    campaignId,
    name: name.trim(),
    description: description.trim(),
    mapNotes: mapNotes.trim(),
    revealed: false
  };
}
