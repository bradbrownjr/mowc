import { afterEach, describe, expect, it, vi } from "vitest";
import type { ContentPack } from "@mowc/shared";
import { PackApiError, createPack, deletePack, getPack, listPacks } from "./contentPacks.js";

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

function mockFetch(response: Partial<Response> & { jsonBody?: unknown }): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: response.ok ?? true,
      status: response.status ?? 200,
      json: () => Promise.resolve(response.jsonBody)
    })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("listPacks", () => {
  it("returns the parsed summary list", async () => {
    mockFetch({ jsonBody: [{ id: "1", name: "A", author: "a", version: "1", createdAt: "", updatedAt: "" }] });

    const result = await listPacks();

    expect(result).toHaveLength(1);
    expect(fetch).toHaveBeenCalledWith("/api/content-packs");
  });
});

describe("getPack", () => {
  it("fetches a single pack by id", async () => {
    mockFetch({ jsonBody: { id: PLACEHOLDER_PACK.id, pack: PLACEHOLDER_PACK } });

    const result = await getPack(PLACEHOLDER_PACK.id);

    expect(result.pack).toEqual(PLACEHOLDER_PACK);
  });

  it("throws PackApiError with a 404 status", async () => {
    mockFetch({ ok: false, status: 404, jsonBody: { errors: [{ path: "id", message: "pack not found" }] } });

    await expect(getPack("missing")).rejects.toThrow(PackApiError);
  });
});

describe("createPack", () => {
  it("posts the full pack payload and returns a summary", async () => {
    mockFetch({
      status: 201,
      jsonBody: { id: PLACEHOLDER_PACK.id, name: PLACEHOLDER_PACK.name, author: PLACEHOLDER_PACK.author, version: PLACEHOLDER_PACK.version, createdAt: "now", updatedAt: "now" }
    });

    const result = await createPack(PLACEHOLDER_PACK);

    expect(result.id).toBe(PLACEHOLDER_PACK.id);
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(PLACEHOLDER_PACK);
  });

  it("surfaces validation errors from a 400 response", async () => {
    mockFetch({ ok: false, status: 400, jsonBody: { errors: [{ path: "name", message: "Required" }] } });

    await expect(createPack(PLACEHOLDER_PACK)).rejects.toMatchObject({
      errors: [{ path: "name", message: "Required" }]
    });
  });
});

describe("deletePack", () => {
  it("resolves on a 204 response", async () => {
    mockFetch({ status: 204, jsonBody: undefined });

    await expect(deletePack(PLACEHOLDER_PACK.id)).resolves.toBeUndefined();
  });

  it("throws on a non-ok response", async () => {
    mockFetch({ ok: false, status: 404, jsonBody: { errors: [] } });

    await expect(deletePack("missing")).rejects.toThrow(PackApiError);
  });
});
