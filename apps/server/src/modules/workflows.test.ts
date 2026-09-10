import { describe, expect, it } from "vitest";
import {
  aggregateCommunityVerification,
  canTransitionIncident,
  canTransitionIntervention,
  interventionTypes,
} from "@civicpulse/shared";
describe("official incident workflow", () => {
  it("allows the documented path and rejects skipping resolution", () => {
    expect(canTransitionIncident("OPEN", "ACKNOWLEDGED")).toBe(true);
    expect(canTransitionIncident("OPEN", "RESOLVED")).toBe(false);
    expect(canTransitionIncident("IN_PROGRESS", "RESOLUTION_SUBMITTED")).toBe(
      true,
    );
  });
});
describe("intervention workflow", () => {
  it("contains every supported participation type", () => {
    expect(interventionTypes).toHaveLength(9);
    expect(interventionTypes).toContain("FUND_AND_EXECUTE");
  });
  it("prevents physical work from skipping authorization", () => {
    expect(canTransitionIntervention("AWAITING_APPROVALS", "IN_PROGRESS")).toBe(
      false,
    );
    expect(
      canTransitionIntervention("AUTHORIZED_TO_COMMENCE", "IN_PROGRESS"),
    ).toBe(true);
  });
});
describe("community resolution aggregation", () => {
  it("requires three uncontested confirmations", () => {
    expect(
      aggregateCommunityVerification({
        confirms: 2,
        disputes: 0,
        evidenceDisputes: 0,
      }),
    ).toBe("UNVERIFIED");
    expect(
      aggregateCommunityVerification({
        confirms: 3,
        disputes: 0,
        evidenceDisputes: 0,
      }),
    ).toBe("COMMUNITY_CONFIRMED");
  });
  it("routes unsupported disputes to review and evidence-backed disputes to disputed", () => {
    expect(
      aggregateCommunityVerification({
        confirms: 4,
        disputes: 1,
        evidenceDisputes: 0,
      }),
    ).toBe("REVIEW_REQUIRED");
    expect(
      aggregateCommunityVerification({
        confirms: 4,
        disputes: 1,
        evidenceDisputes: 1,
      }),
    ).toBe("COMMUNITY_DISPUTED");
  });
});
