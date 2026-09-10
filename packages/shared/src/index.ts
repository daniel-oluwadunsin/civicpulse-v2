export const incidentStatuses = [
  "OPEN",
  "ACKNOWLEDGED",
  "UNDER_REVIEW",
  "IN_PROGRESS",
  "RESOLUTION_SUBMITTED",
  "RESOLVED",
  "CLOSED",
  "REJECTED_INVALID",
  "BLOCKED",
] as const;
export type IncidentStatus = (typeof incidentStatuses)[number];
export const communityStatuses = [
  "UNVERIFIED",
  "COMMUNITY_CONFIRMED",
  "COMMUNITY_DISPUTED",
  "REVIEW_REQUIRED",
] as const;
export type CommunityStatus = (typeof communityStatuses)[number];
export const organizationRoles = [
  "MEMBER",
  "OFFICER",
  "MANAGER",
  "ORG_ADMIN",
] as const;
export type OrganizationRole = (typeof organizationRoles)[number];
export const issueCategories = [
  "ROADS",
  "DRAINAGE",
  "WATER",
  "WASTE",
  "POWER",
  "EDUCATION",
  "HEALTH",
  "PUBLIC_BUILDING",
  "OTHER",
] as const;
export type IssueCategory = (typeof issueCategories)[number];
export const interventionTypes = [
  "FUND",
  "CO_FUND",
  "EXECUTE",
  "FUND_AND_EXECUTE",
  "MATERIALS",
  "TECHNICAL_ASSISTANCE",
  "COMMUNITY_SUPPORT",
  "MONITORING",
  "ADVOCACY",
] as const;
export type InterventionType = (typeof interventionTypes)[number];
export const interventionStatuses = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "CHANGES_REQUESTED",
  "RESUBMITTED",
  "APPROVED_IN_PRINCIPLE",
  "AWAITING_APPROVALS",
  "AUTHORIZED_TO_COMMENCE",
  "IN_PROGRESS",
  "COMPLETION_SUBMITTED",
  "INSPECTION",
  "REMEDIATION_REQUIRED",
  "ACCEPTED",
  "HANDOVER_COMPLETE",
  "REJECTED",
  "WITHDRAWN",
  "EXPIRED",
] as const;
export type InterventionStatus = (typeof interventionStatuses)[number];

const incidentTransitions: Record<IncidentStatus, readonly IncidentStatus[]> = {
  OPEN: ["ACKNOWLEDGED"],
  ACKNOWLEDGED: ["UNDER_REVIEW", "IN_PROGRESS", "BLOCKED"],
  UNDER_REVIEW: ["IN_PROGRESS", "BLOCKED", "REJECTED_INVALID"],
  IN_PROGRESS: ["BLOCKED", "RESOLUTION_SUBMITTED"],
  RESOLUTION_SUBMITTED: ["RESOLVED", "IN_PROGRESS"],
  RESOLVED: ["CLOSED", "IN_PROGRESS"],
  BLOCKED: ["UNDER_REVIEW", "IN_PROGRESS"],
  CLOSED: [],
  REJECTED_INVALID: [],
};
export const canTransitionIncident = (
  from: IncidentStatus,
  to: IncidentStatus,
) => incidentTransitions[from].includes(to);

const interventionTransitions: Record<
  InterventionStatus,
  readonly InterventionStatus[]
> = {
  DRAFT: ["SUBMITTED", "WITHDRAWN"],
  SUBMITTED: ["UNDER_REVIEW", "WITHDRAWN", "EXPIRED"],
  UNDER_REVIEW: [
    "CHANGES_REQUESTED",
    "REJECTED",
    "APPROVED_IN_PRINCIPLE",
    "EXPIRED",
  ],
  CHANGES_REQUESTED: ["RESUBMITTED", "WITHDRAWN", "EXPIRED"],
  RESUBMITTED: ["UNDER_REVIEW", "WITHDRAWN", "EXPIRED"],
  APPROVED_IN_PRINCIPLE: ["AWAITING_APPROVALS", "WITHDRAWN", "EXPIRED"],
  AWAITING_APPROVALS: [
    "AUTHORIZED_TO_COMMENCE",
    "REJECTED",
    "WITHDRAWN",
    "EXPIRED",
  ],
  AUTHORIZED_TO_COMMENCE: ["IN_PROGRESS"],
  IN_PROGRESS: ["COMPLETION_SUBMITTED"],
  COMPLETION_SUBMITTED: ["INSPECTION"],
  INSPECTION: ["ACCEPTED", "REMEDIATION_REQUIRED", "REJECTED"],
  REMEDIATION_REQUIRED: ["IN_PROGRESS"],
  ACCEPTED: ["HANDOVER_COMPLETE"],
  HANDOVER_COMPLETE: [],
  REJECTED: [],
  WITHDRAWN: [],
  EXPIRED: [],
};
export const canTransitionIntervention = (
  from: InterventionStatus,
  to: InterventionStatus,
) => interventionTransitions[from].includes(to);

export function aggregateCommunityVerification(input: {
  confirms: number;
  disputes: number;
  evidenceDisputes: number;
}): CommunityStatus {
  if (input.evidenceDisputes > 0) return "COMMUNITY_DISPUTED";
  if (input.disputes > 0) return "REVIEW_REQUIRED";
  if (input.confirms >= 3) return "COMMUNITY_CONFIRMED";
  return "UNVERIFIED";
}
export type ApiError = {
  error: { code: string; message: string; details?: unknown };
};
