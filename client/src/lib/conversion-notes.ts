/**
 * Buckets a draft's conversionNotes (shared/src/schemas/conversion.ts,
 * formatConversionNote grammar "<fieldPath>: <message>") by the field they
 * reference, so the review screen (packs/convert) can render each note next
 * to the field it flags instead of one flat dump. The path vocabulary is
 * fixed by server/src/api/conversion/parse.ts: "pack", "playbooks[0]",
 * "playbooks[0].moves[n].outcomes", "playbooks[0].movesToPick",
 * "basicMoves[n].outcomes". unclaimedNotes is a safety net so a future path
 * shape not covered here is still surfaced somewhere rather than dropped
 * ("flag, never guess" applies to this UI too).
 */

function pathOf(note: string): string {
  const idx = note.indexOf(":");
  return idx === -1 ? note.trim() : note.slice(0, idx).trim();
}

function isIndexed(path: string, arrayPrefix: string, index: number): boolean {
  const withIndex = `${arrayPrefix}[${index}]`;
  if (!path.startsWith(withIndex)) return false;
  const rest = path.slice(withIndex.length);
  return rest === "" || rest.startsWith(".");
}

function isPlaybookGeneral(path: string): boolean {
  // "playbooks[0].moves[" excludes indexed move entries; a plain string
  // prefix check on "playbooks[0].moves" would also swallow the unrelated
  // "playbooks[0].movesToPick" field.
  return path === "playbooks[0]" || (path.startsWith("playbooks[0].") && !path.startsWith("playbooks[0].moves["));
}

export function notesForPackFields(notes: string[]): string[] {
  return notes.filter((n) => pathOf(n) === "pack");
}

export function notesForPlaybookGeneral(notes: string[]): string[] {
  return notes.filter((n) => isPlaybookGeneral(pathOf(n)));
}

export function notesForMove(notes: string[], index: number): string[] {
  return notes.filter((n) => isIndexed(pathOf(n), "playbooks[0].moves", index));
}

export function notesForBasicMove(notes: string[], index: number): string[] {
  return notes.filter((n) => isIndexed(pathOf(n), "basicMoves", index));
}

export function unclaimedNotes(notes: string[], moveCount: number, basicMoveCount: number): string[] {
  return notes.filter((n) => {
    const path = pathOf(n);
    if (path === "pack" || isPlaybookGeneral(path)) return false;
    for (let i = 0; i < moveCount; i++) {
      if (isIndexed(path, "playbooks[0].moves", i)) return false;
    }
    for (let i = 0; i < basicMoveCount; i++) {
      if (isIndexed(path, "basicMoves", i)) return false;
    }
    return true;
  });
}
