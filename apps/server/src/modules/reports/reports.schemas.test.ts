import { describe, expect, it } from "vitest";
import { reportAnalysisSchema } from "./reports.schemas.js";
describe("reportAnalysisSchema", () => {
  it("accepts a constrained civic analysis", () => {
    expect(
      reportAnalysisSchema.parse({
        hasCivicIssue: true,
        detectedLanguage: "Nigerian Pidgin",
        title: "Blocked drainage",
        summary: "Water is not flowing.",
        fullDescription:
          "A drainage channel near the market is blocked and flooding the road.",
        category: "DRAINAGE",
        affectedAssets: ["DRAINAGE_CHANNEL"],
        observations: ["standing water visible"],
        urgencySignals: ["flood risk"],
        locationMentions: ["Kuto Market"],
      }).category,
    ).toBe("DRAINAGE");
  });
  it("rejects an unsupported issue category", () => {
    expect(() =>
      reportAnalysisSchema.parse({
        hasCivicIssue: true,
        detectedLanguage: "English",
        title: "Issue",
        summary: "Summary",
        fullDescription: "Description",
        category: "CRYPTO",
        affectedAssets: [],
        observations: [],
        urgencySignals: [],
        locationMentions: [],
      }),
    ).toThrow();
  });
});
