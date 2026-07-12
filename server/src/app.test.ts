import { describe, expect, it } from "vitest";
import request from "supertest";
import { HealthzResponseSchema } from "@mowc/shared";
import { createApp } from "./app.js";

describe("GET /healthz", () => {
  it("returns status ok and the given version", async () => {
    const app = createApp("0.1.0-test");

    const res = await request(app).get("/healthz");

    expect(res.status).toBe(200);
    const body = HealthzResponseSchema.parse(res.body);
    expect(body.status).toBe("ok");
    expect(body.version).toBe("0.1.0-test");
  });
});
