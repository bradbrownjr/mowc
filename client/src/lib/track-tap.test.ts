import { describe, expect, it } from "vitest";
import { crossesUnstable, nextTrackValue } from "./track-tap.js";

describe("nextTrackValue", () => {
  it("marks forward: tapping box N fills up to and including N", () => {
    expect(nextTrackValue(0, 7, 3)).toBe(3);
    expect(nextTrackValue(2, 7, 5)).toBe(5);
  });

  it("marks backward: tapping ahead when some are already filled", () => {
    expect(nextTrackValue(5, 7, 2)).toBe(2);
  });

  it("undoes the last mark: tapping the highest-filled box decrements", () => {
    expect(nextTrackValue(3, 7, 3)).toBe(2);
    expect(nextTrackValue(1, 7, 1)).toBe(0);
  });

  it("tapping the only-filled box empties the track", () => {
    expect(nextTrackValue(1, 5, 1)).toBe(0);
  });

  it("clamps to the maximum", () => {
    expect(nextTrackValue(0, 5, 9)).toBe(5);
  });

  it("clamps to zero", () => {
    expect(nextTrackValue(0, 5, 0)).toBe(0);
  });

  it("handles a zero-length track", () => {
    expect(nextTrackValue(0, 0, 1)).toBe(0);
  });
});

describe("crossesUnstable", () => {
  it("is true at and above the threshold", () => {
    expect(crossesUnstable(4, 4)).toBe(true);
    expect(crossesUnstable(6, 4)).toBe(true);
  });

  it("is false below the threshold", () => {
    expect(crossesUnstable(3, 4)).toBe(false);
    expect(crossesUnstable(0, 4)).toBe(false);
  });
});
