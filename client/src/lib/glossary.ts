/**
 * Canonical gloss strings for MotW game terms (docs/DESIGN.md "Plain
 * language (glossary policy)"). Screens import these rather than
 * retyping the parenthetical explanation, so wording stays consistent
 * app-wide. Original wording only, never Evil Hat/Michael Sands text
 * (AGENTS.md rule 1).
 */
export const GLOSS = {
  keeper: "Keeper (the person running the game)",
  hunter: "hunter (a player's character)",
  playbook: "playbook (a character template)",
  move: "move (an action your character can roll dice for)",
  mystery: "mystery (one session's case)"
} as const;
