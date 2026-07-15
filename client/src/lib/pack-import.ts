import JSZip from "jszip";
import { ContentPackSchema, type ContentPack } from "@mowc/shared";

export interface ImportOutcome {
  name: string;
  ok: boolean;
  pack?: ContentPack;
  message?: string;
}

export function parsePackJson(name: string, text: string): ImportOutcome {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { name, ok: false, message: `${name} is not valid JSON.` };
  }

  const result = ContentPackSchema.safeParse(parsed);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    return {
      name,
      ok: false,
      message: `${name} is not a valid .mowcpack.json file: ${details || "invalid format"}`
    };
  }

  return { name, ok: true, pack: result.data };
}

export function isZipFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(".zip") || file.type === "application/zip";
}

export async function extractPacksFromZip(file: File): Promise<ImportOutcome[]> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const entries = Object.values(zip.files).filter(
    (entry) => !entry.dir && entry.name.toLowerCase().endsWith(".json")
  );

  if (entries.length === 0) {
    return [{ name: file.name, ok: false, message: `${file.name} contains no .json files.` }];
  }

  const outcomes: ImportOutcome[] = [];
  for (const entry of entries) {
    const text = await entry.async("text");
    outcomes.push(parsePackJson(entry.name, text));
  }
  return outcomes;
}

export async function extractPacksFromFiles(files: Iterable<File>): Promise<ImportOutcome[]> {
  const outcomes: ImportOutcome[] = [];
  for (const file of files) {
    if (isZipFile(file)) {
      outcomes.push(...(await extractPacksFromZip(file)));
    } else {
      outcomes.push(parsePackJson(file.name, await file.text()));
    }
  }
  return outcomes;
}
