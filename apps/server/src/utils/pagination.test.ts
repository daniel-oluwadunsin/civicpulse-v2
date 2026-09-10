import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor } from "./pagination.js";

describe("opaque cursors", () => {
  it("round trips a nearby cursor", () => {
    const value = {
      at: "2026-09-09T12:00:00.000Z",
      id: "8b9b5ddf-d603-490f-9848-f26fb3649f95",
      distance: 42.5,
    };
    expect(decodeCursor(encodeCursor(value))).toEqual(value);
  });

  it("rejects malformed cursors", () => {
    expect(() => decodeCursor("not-a-cursor")).toThrowError(
      /pagination cursor is invalid/i,
    );
  });
});
