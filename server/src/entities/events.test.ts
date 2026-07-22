import { describe, expect, it } from "vitest";
import { createCampaignEventBus } from "./events.js";

describe("CampaignEventBus", () => {
  it("delivers a published seq to every subscriber of that bucket", () => {
    const bus = createCampaignEventBus();
    const a: number[] = [];
    const b: number[] = [];
    bus.subscribe("campaign-1", (seq) => a.push(seq));
    bus.subscribe("campaign-1", (seq) => b.push(seq));

    bus.publish("campaign-1", 7);

    expect(a).toEqual([7]);
    expect(b).toEqual([7]);
  });

  it("never delivers a bucket's event to a different bucket's subscriber", () => {
    const bus = createCampaignEventBus();
    const other: number[] = [];
    bus.subscribe("campaign-2", (seq) => other.push(seq));

    bus.publish("campaign-1", 3);

    expect(other).toEqual([]);
  });

  it("stops delivering after unsubscribe", () => {
    const bus = createCampaignEventBus();
    const seen: number[] = [];
    const off = bus.subscribe("c", (seq) => seen.push(seq));

    bus.publish("c", 1);
    off();
    bus.publish("c", 2);

    expect(seen).toEqual([1]);
  });

  it("is a no-op to publish to a bucket with no subscribers", () => {
    const bus = createCampaignEventBus();
    expect(() => bus.publish("nobody-here", 5)).not.toThrow();
  });

  it("keeps delivering to remaining subscribers when one throws (best-effort fan-out)", () => {
    const bus = createCampaignEventBus();
    const seen: number[] = [];
    bus.subscribe("c", () => {
      throw new Error("dead socket");
    });
    bus.subscribe("c", (seq) => seen.push(seq));

    // A throwing listener (e.g. a write to a half-closed SSE socket) is isolated:
    // publish does not propagate it, and the healthy listener still wakes.
    expect(() => bus.publish("c", 9)).not.toThrow();
    expect(seen).toEqual([9]);
  });
});
