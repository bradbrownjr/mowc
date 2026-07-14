/**
 * Pure dice-roll math for the character sheet's move rollers. Extracted so
 * it's unit-testable without a browser (AGENTS.md: Svelte component testing
 * isn't established here).
 *
 * Fixed engine constants (docs/DATA-MODEL.md): 2d6 + rating, 10+ full
 * success, 7-9 mixed, miss on 6 or less. Not pack-configurable.
 */

export type RollBand = "full" | "mixed" | "miss";

export interface RollResult {
  die1: number;
  die2: number;
  total: number;
  band: RollBand;
}

function bandFor(total: number): RollBand {
  if (total >= 10) return "full";
  if (total >= 7) return "mixed";
  return "miss";
}

/**
 * Rolls 2d6 + rating. `rng` defaults to `Math.random` but is injectable so
 * tests can drive deterministic dice without flakiness; each call to `rng`
 * should return a value in `[0, 1)`, matching `Math.random`'s contract.
 */
export function rollMove(rating: number, rng: () => number = Math.random): RollResult {
  const die1 = Math.floor(rng() * 6) + 1;
  const die2 = Math.floor(rng() * 6) + 1;
  const total = die1 + die2 + rating;
  return { die1, die2, total, band: bandFor(total) };
}
