import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import type { ContentPack } from "@mowc/shared";
import { extractPacksFromFiles, extractPacksFromZip, isZipFile, parsePackJson } from "./pack-import.js";

const PLACEHOLDER_PACK: ContentPack = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  name: "The Placeholder Pack",
  author: "Test Fixtures",
  version: "1.0.0",
  playbooks: [],
  basicMoves: [],
  monsterTypes: [],
  bystanderTypes: [],
  minionTypes: [],
  gear: []
};

function jsonFile(name: string, contents: unknown): File {
  return new File([JSON.stringify(contents)], name, { type: "application/json" });
}

describe("parsePackJson", () => {
  it("parses a valid pack", () => {
    const outcome = parsePackJson("a.mowcpack.json", JSON.stringify(PLACEHOLDER_PACK));
    expect(outcome.ok).toBe(true);
    expect(outcome.pack).toEqual(PLACEHOLDER_PACK);
  });

  it("rejects invalid JSON", () => {
    const outcome = parsePackJson("a.mowcpack.json", "{not json");
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toContain("not valid JSON");
  });

  it("rejects JSON that doesn't match the schema", () => {
    const outcome = parsePackJson("a.mowcpack.json", JSON.stringify({ name: "missing fields" }));
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toContain("not a valid .mowcpack.json file");
  });
});

describe("isZipFile", () => {
  it("recognizes .zip by extension", () => {
    expect(isZipFile(new File([], "packs.zip"))).toBe(true);
  });

  it("recognizes zip by mime type", () => {
    expect(isZipFile(new File([], "packs", { type: "application/zip" }))).toBe(true);
  });

  it("rejects a plain json file", () => {
    expect(isZipFile(jsonFile("a.mowcpack.json", PLACEHOLDER_PACK))).toBe(false);
  });
});

describe("extractPacksFromZip", () => {
  it("extracts every json entry as a pack outcome", async () => {
    const zip = new JSZip();
    zip.file("a.mowcpack.json", JSON.stringify(PLACEHOLDER_PACK));
    zip.file(
      "b.mowcpack.json",
      JSON.stringify({ ...PLACEHOLDER_PACK, id: "650e8400-e29b-41d4-a716-446655440001", name: "Pack B" })
    );
    zip.file("README.txt", "not a pack");
    const blob = await zip.generateAsync({ type: "blob" });
    const file = new File([blob], "packs.zip", { type: "application/zip" });

    const outcomes = await extractPacksFromZip(file);

    expect(outcomes).toHaveLength(2);
    expect(outcomes.every((o) => o.ok)).toBe(true);
    expect(outcomes.map((o) => o.pack?.name).sort()).toEqual(["Pack B", "The Placeholder Pack"]);
  });

  it("reports a single error when the zip has no json files", async () => {
    const zip = new JSZip();
    zip.file("README.txt", "nothing here");
    const blob = await zip.generateAsync({ type: "blob" });
    const file = new File([blob], "empty.zip", { type: "application/zip" });

    const outcomes = await extractPacksFromZip(file);

    expect(outcomes).toEqual([{ name: "empty.zip", ok: false, message: "empty.zip contains no .json files." }]);
  });
});

describe("extractPacksFromFiles", () => {
  it("handles a mix of plain json files and a zip in one call", async () => {
    const zip = new JSZip();
    zip.file(
      "zipped.mowcpack.json",
      JSON.stringify({ ...PLACEHOLDER_PACK, id: "650e8400-e29b-41d4-a716-446655440002", name: "Zipped Pack" })
    );
    const blob = await zip.generateAsync({ type: "blob" });
    const zipFile = new File([blob], "packs.zip", { type: "application/zip" });

    const plainFile = jsonFile("plain.mowcpack.json", PLACEHOLDER_PACK);

    const outcomes = await extractPacksFromFiles([plainFile, zipFile]);

    expect(outcomes.map((o) => o.name)).toEqual(["plain.mowcpack.json", "zipped.mowcpack.json"]);
    expect(outcomes.every((o) => o.ok)).toBe(true);
  });
});
