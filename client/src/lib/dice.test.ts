import { describe, expect, it } from "vitest";
import { rollMove } from "./dice.js";

/** A stub rng that returns a fixed sequence of `[0, 1)` values in order. */
function sequence(...values: number[]): () => number {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}

describe("rollMove", () => {
  it("sums two dice plus rating", () => {
    // 0 -> die 1, 0.99 -> die 6
    const result = rollMove(2, sequence(0, 0.99));
    expect(result.die1).toBe(1);
    expect(result.die2).toBe(6);
    expect(result.total).toBe(9);
  });

  it("keeps each die in 1-6", () => {
    for (let i = 0; i < 6; i++) {
      const rng = sequence(i / 6, i / 6);
      const result = rollMove(0, rng);
      expect(result.die1).toBeGreaterThanOrEqual(1);
      expect(result.die1).toBeLessThanOrEqual(6);
      expect(result.die2).toBeGreaterThanOrEqual(1);
      expect(result.die2).toBeLessThanOrEqual(6);
    }
  });

  it("bands a miss at 6 or below", () => {
    expect(rollMove(-1, sequence(0, 0)).total).toBe(1);
    expect(rollMove(-1, sequence(0, 0)).band).toBe("miss");
    // die1=1 die2=1 rating=4 -> total 6, still a miss (boundary)
    expect(rollMove(4, sequence(0, 0)).total).toBe(6);
    expect(rollMove(4, sequence(0, 0)).band).toBe("miss");
  });

  it("bands mixed at 7-9", () => {
    // die1=1 die2=1 rating=5 -> total 7 (lower boundary)
    expect(rollMove(5, sequence(0, 0)).band).toBe("mixed");
    // die1=1 die2=1 rating=7 -> total 9 (upper boundary)
    expect(rollMove(7, sequence(0, 0)).band).toBe("mixed");
  });

  it("bands full success at 10+", () => {
    // die1=1 die2=1 rating=8 -> total 10 (lower boundary)
    expect(rollMove(8, sequence(0, 0)).band).toBe("full");
    // die1=6 die2=6 rating=3 -> total 15
    expect(rollMove(3, sequence(0.99, 0.99)).band).toBe("full");
  });

  it("defaults to Math.random when no rng is given", () => {
    const result = rollMove(0);
    expect(result.total).toBeGreaterThanOrEqual(2);
    expect(result.total).toBeLessThanOrEqual(12);
  });
});
