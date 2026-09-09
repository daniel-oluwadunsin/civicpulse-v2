import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
describe("ApiError", () => {
  it("preserves a stable server error code", () => {
    const error = new ApiError("LOCATION_REQUIRED", "Confirm a location.");
    expect(error.code).toBe("LOCATION_REQUIRED");
    expect(error.message).toBe("Confirm a location.");
  });
});
