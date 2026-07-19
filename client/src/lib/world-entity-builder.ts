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

/** All location types across every attached content pack, in pack order. */
export function flattenLocationTypes(packs: ContentPack[]): ArchetypeDef[] {
  return packs.flatMap((pack) => pack.locationTypes);
}

/**
 * One-line reasons a disabled Create button can't submit yet (docs/DESIGN.md
 * "Screen patterns": "a disabled Next is always accompanied by a field note
 * saying what is missing"), so these single-screen forms get the same
 * proactive guidance as the multi-step wizards. Null once the form is
 * complete.
 */
export function minionFormReason(name: string, harmCapacity: number | ""): string | null {
  if (!name.trim()) return "Give this minion a name to continue.";
  const cap = typeof harmCapacity === "number" ? harmCapacity : parseInt(harmCapacity, 10) || 0;
  if (cap <= 0) return "Harm capacity must be greater than 0.";
  return null;
}

export function bystanderFormReason(name: string): string | null {
  return name.trim() ? null : "Give this bystander a name to continue.";
}

export function locationFormReason(name: string): string | null {
  return name.trim() ? null : "Give this location a name to continue.";
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
  typeId: string | null;
  description: string;
  mapNotes: string;
}): Location {
  const { id, campaignId, name, typeId, description, mapNotes } = params;
  return {
    id,
    campaignId,
    name: name.trim(),
    typeId: typeId || null,
    description: description.trim(),
    mapNotes: mapNotes.trim(),
    revealed: false
  };
}
