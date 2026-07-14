/**
 * Pure tap-a-track interaction math for the character sheet's Luck, Harm,
 * and Experience tracks. Extracted so it's unit-testable without a browser
 * (AGENTS.md: Svelte component testing isn't established here).
 */

/**
 * The new track count after tapping a box.
 *
 * Boxes are 1-indexed. Tapping box N marks forward, filling every box up to
 * and including N (new count = N). Tapping the currently-highest-filled box
 * (tappedIndex === current) undoes that last mark (new count = current - 1).
 * The result is clamped to [0, max].
 */
export function nextTrackValue(current: number, max: number, tappedIndex: number): number {
  const target = tappedIndex === current ? current - 1 : tappedIndex;
  return Math.max(0, Math.min(max, target));
}

/**
 * Whether a harm value has reached the unstable threshold. Crossing it sets
 * `unstable: true`; per Monster of the Week's rules this flag is never
 * auto-cleared when harm later drops (recovery is a table decision), so this
 * only reports the set-true condition.
 */
export function crossesUnstable(harm: number, unstableAt: number): boolean {
  return harm >= unstableAt;
}
