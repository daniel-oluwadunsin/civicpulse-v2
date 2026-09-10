import { Router } from "express";
import { requireAuth, requirePlatformRole } from "../../middleware/auth.js";
import { databaseRateLimit } from "../../middleware/database-rate-limit.js";
import { moderationReportSchema } from "../incidents/incidents.schemas.js";
import { query, transaction } from "../../db/pool.js";
import { z } from "zod";
import { AppError } from "../../utils/errors.js";
const router = Router();
router.post(
  "/reports",
  requireAuth,
  databaseRateLimit("moderation-report", 10),
  async (req, res, next) => {
    try {
      const input = moderationReportSchema.parse(req.body);
      const row = await query<{ id: string }>(
        "insert into moderation_reports(reporter_user_id,target_type,target_id,reason) values($1,$2,$3,$4) returning id",
        [
          req.user!.id,
          input.targetType,
          input.targetId,
          JSON.stringify({ reason: input.reason, details: input.details }),
        ],
      );
      res.status(201).json({ data: { id: row.rows[0]!.id, status: "OPEN" } });
    } catch (e) {
      next(e);
    }
  },
);
const requireModerator = [
  requireAuth,
  requirePlatformRole("MODERATOR", "CIVICPULSE_ADMIN"),
] as const;
router.patch(
  "/evidence/:evidenceId",
  ...requireModerator,
  async (req, res, next) => {
    try {
      const evidenceId = z.string().uuid().parse(req.params.evidenceId);
      const input = z
        .object({
          moderationStatus: z.enum(["APPROVED", "HIDDEN", "REMOVED"]),
          visibility: z.enum(["PUBLIC", "RESTRICTED"]),
          publicDerivativeUrl: z
            .string()
            .url()
            .refine((value) => new URL(value).hostname === "res.cloudinary.com")
            .optional(),
          note: z.string().trim().min(5).max(2000),
        })
        .parse(req.body);
      if (
        input.moderationStatus === "APPROVED" &&
        input.visibility === "PUBLIC" &&
        !input.publicDerivativeUrl
      )
        throw new AppError(
          400,
          "PUBLIC_DERIVATIVE_REQUIRED",
          "Public evidence requires a moderated derivative URL.",
        );
      await transaction(async (client) => {
        const updated = await client.query(
          "update incident_evidence set moderation_status=$1,visibility=$2,public_derivative_url=case when $2='PUBLIC' then $3 else null end where id=$4",
          [
            input.moderationStatus,
            input.visibility,
            input.publicDerivativeUrl ?? null,
            evidenceId,
          ],
        );
        if (!updated.rowCount)
          throw new AppError(404, "NOT_FOUND", "Evidence item was not found.");
        await client.query(
          "insert into audit_logs(actor_user_id,action,target_type,target_id,metadata,request_id) values($1,'EVIDENCE_MODERATION','evidence',$2,$3,$4)",
          [req.user!.id, evidenceId, JSON.stringify(input), req.requestId],
        );
      });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  },
);
router.get("/reports", ...requireModerator, async (_req, res, next) => {
  try {
    const rows = await query(
      "select id,target_type,target_id,reason,status,created_at from moderation_reports where status='OPEN' order by created_at",
    );
    res.json({ data: rows.rows });
  } catch (error) {
    next(error);
  }
});
router.patch(
  "/reports/:reportId",
  ...requireModerator,
  async (req, res, next) => {
    try {
      const reportId = z.string().uuid().parse(req.params.reportId);
      const input = z
        .object({
          decision: z.enum(["HIDE", "NO_ACTION"]),
          note: z.string().trim().min(5).max(2000),
        })
        .parse(req.body);
      await transaction(async (client) => {
        const report = await client.query<{
          target_type: string;
          target_id: string;
        }>(
          "select target_type,target_id from moderation_reports where id=$1 and status='OPEN' for update",
          [reportId],
        );
        const item = report.rows[0];
        if (!item)
          throw new AppError(
            404,
            "NOT_FOUND",
            "Open moderation report was not found.",
          );
        if (input.decision === "HIDE") {
          if (item.target_type === "COMMENT")
            await client.query(
              "update incident_comments set moderation_status='HIDDEN' where id=$1",
              [item.target_id],
            );
          else if (item.target_type === "EVIDENCE")
            await client.query(
              "update incident_evidence set moderation_status='HIDDEN' where id=$1",
              [item.target_id],
            );
          else if (item.target_type === "UPDATE")
            await client.query(
              "update incident_updates set moderation_status='HIDDEN' where id=$1",
              [item.target_id],
            );
          else if (item.target_type === "INCIDENT")
            await client.query(
              "update incidents set public_visibility='PRIVATE_REVIEW',updated_at=now() where id=$1",
              [item.target_id],
            );
        }
        await client.query(
          "update moderation_reports set status='RESOLVED',decision_note=$1,resolved_by=$2,resolved_at=now() where id=$3",
          [input.note, req.user!.id, reportId],
        );
        await client.query(
          "insert into audit_logs(actor_user_id,action,target_type,target_id,metadata,request_id) values($1,'MODERATION_DECISION','moderation_report',$2,$3,$4)",
          [
            req.user!.id,
            reportId,
            JSON.stringify({
              decision: input.decision,
              note: input.note,
              targetType: item.target_type,
              targetId: item.target_id,
            }),
            req.requestId,
          ],
        );
      });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  },
);
export default router;
