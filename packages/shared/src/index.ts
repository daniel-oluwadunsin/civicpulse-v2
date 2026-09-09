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
export type ApiError = {
  error: { code: string; message: string; details?: unknown };
};
