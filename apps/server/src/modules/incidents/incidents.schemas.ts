import { issueCategories } from "@civicpulse/shared";
import { z } from "zod";

export const feedQuerySchema = z.object({
  feed: z.enum(["for-you", "nearby", "following"]).default("for-you"),
  category: z.enum(issueCategories).optional(),
  officialStatus: z.string().max(40).optional(),
  communityStatus: z.string().max(40).optional(),
  lgaId: z.string().uuid().optional(),
  stateId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  updatedSince: z.coerce.date().optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export const commentSchema = z.object({
  body: z.string().trim().min(1).max(2000),
  parentCommentId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  mentionedOrganizationIds: z.array(z.string().uuid()).max(5).default([]),
});
export const reactionSchema = z.object({ reaction: z.enum(["UP", "DOWN"]) });
export const moderationReportSchema = z.object({
  targetType: z.enum([
    "INCIDENT",
    "EVIDENCE",
    "UPDATE",
    "COMMENT",
    "ORGANIZATION",
  ]),
  targetId: z.string().uuid(),
  reason: z.enum([
    "HARASSMENT",
    "THREAT",
    "HATE_ABUSE",
    "SPAM",
    "DOXXING",
    "IMPERSONATION",
    "MISLEADING",
    "GRAPHIC",
    "IRRELEVANT",
  ]),
  details: z.string().trim().max(1000).optional(),
});
