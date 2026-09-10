import { Router } from "express";
import { z } from "zod";
import { transaction, query } from "../../db/pool.js";
import { requireAuth, requirePlatformRole } from "../../middleware/auth.js";
import { AppError } from "../../utils/errors.js";
import { env } from "../../config/env.js";
import { sendEmail, verifyEmailProvider } from "../../providers/email.js";
import {
  invitationHash,
  invitationToken,
  sendOnboardingInvitation,
} from "../organizations/invitations.js";

const router = Router();
router.use(requireAuth, requirePlatformRole("CIVICPULSE_ADMIN"));

router.get("/overview", async (_req, res, next) => {
  try {
    const result = await query<{
      organizations_pending: number;
      moderation_open: number;
      routing_reviews: number;
      resolution_disputes: number;
      processing_failures: number;
      merge_reviews: number;
    }>(`select
      (select count(*)::int from organizations where onboarding_status in ('SUBMITTED','CHANGES_REQUESTED')) organizations_pending,
      (select count(*)::int from moderation_reports where status='OPEN') moderation_open,
      (select count(*)::int from routing_review_requests where status='OPEN') routing_reviews,
      (select count(*)::int from resolution_review_cases where status='OPEN') resolution_disputes,
      (select count(*)::int from reports where status='FAILED') processing_failures,
      (select count(*)::int from incident_match_reviews where status='OPEN') merge_reviews`);
    const row = result.rows[0]!;
    res.json({
      data: {
        organizationsPending: row.organizations_pending,
        moderationOpen: row.moderation_open,
        routingReviews: row.routing_reviews,
        resolutionDisputes: row.resolution_disputes,
        processingFailures: row.processing_failures,
        mergeReviews: row.merge_reviews,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/provider-health", async (_req, res, next) => {
  try {
    let email = { configured: env.smtpConfigured, reachable: false };
    if (env.smtpConfigured) email = await verifyEmailProvider();
    res.json({
      data: {
        email,
        cloudinary: { configured: env.cloudinaryConfigured },
        gemini: { configured: env.geminiKeys.length > 0 },
        geoapify: { configured: Boolean(env.GEOAPIFY_API_KEY) },
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/provider-health/email-test", async (req, res, next) => {
  try {
    await sendEmail({
      to: req.user!.email,
      subject: "CivicPulse email delivery test",
      text: "CivicPulse successfully connected to the configured email provider.",
    });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.get("/organization-onboarding-invitations", async (_req, res, next) => {
  try {
    const rows = await query(
      `select id,email,organization_kind kind,organization_name,case when status='PENDING' and expires_at<=now() then 'EXPIRED' else status end status,expires_at,accepted_at,organization_id,created_at
       from organization_onboarding_invitations order by created_at desc limit 100`,
    );
    res.json({ data: rows.rows });
  } catch (error) {
    next(error);
  }
});

router.post("/organization-onboarding-invitations", async (req, res, next) => {
  try {
    const input = z
      .object({
        email: z
          .string()
          .email()
          .transform((value) => value.toLowerCase()),
        kind: z.enum(["GOVERNMENT", "NGO"]),
        organizationName: z.string().trim().min(2).max(200),
      })
      .parse(req.body);
    const raw = invitationToken();
    const invitation = await transaction(async (client) => {
      await client.query(
        "update organization_onboarding_invitations set status='REVOKED',revoked_at=now(),updated_at=now() where lower(email)=lower($1) and organization_kind=$2 and status='PENDING'",
        [input.email, input.kind],
      );
      const created = await client.query<{ id: string }>(
        "insert into organization_onboarding_invitations(email,organization_kind,organization_name,token_hash,invited_by,expires_at) values($1,$2,$3,$4,$5,now()+interval '7 days') returning id",
        [
          input.email,
          input.kind,
          input.organizationName,
          invitationHash(raw),
          req.user!.id,
        ],
      );
      await client.query(
        "insert into audit_logs(actor_user_id,action,target_type,target_id,metadata,request_id) values($1,'ORGANIZATION_ONBOARDING_INVITED','organization_onboarding_invitation',$2,$3,$4)",
        [
          req.user!.id,
          created.rows[0]!.id,
          JSON.stringify({
            kind: input.kind,
            organizationName: input.organizationName,
          }),
          req.requestId,
        ],
      );
      return created.rows[0]!;
    });
    await sendOnboardingInvitation({ ...input, token: raw });
    res.status(201).json({ data: { id: invitation.id, status: "PENDING" } });
  } catch (error) {
    next(error);
  }
});

router.post(
  "/organization-onboarding-invitations/:invitationId/resend",
  async (req, res, next) => {
    try {
      const id = z.string().uuid().parse(req.params.invitationId);
      const raw = invitationToken();
      const result = await query<{
        email: string;
        organization_name: string;
        organization_kind: "GOVERNMENT" | "NGO";
      }>(
        `update organization_onboarding_invitations
         set token_hash=$1,status='PENDING',expires_at=now()+interval '7 days',accepted_by=null,accepted_at=null,revoked_at=null,updated_at=now()
         where id=$2 and organization_id is null and status in ('PENDING','EXPIRED','REVOKED')
         returning email,organization_name,organization_kind`,
        [invitationHash(raw), id],
      );
      const item = result.rows[0];
      if (!item)
        throw new AppError(
          409,
          "INVITATION_NOT_RESENDABLE",
          "This invitation cannot be resent.",
        );
      await query(
        "insert into audit_logs(actor_user_id,action,target_type,target_id,metadata,request_id) values($1,'ORGANIZATION_ONBOARDING_INVITATION_RESENT','organization_onboarding_invitation',$2,$3,$4)",
        [
          req.user!.id,
          id,
          JSON.stringify({ email: item.email, kind: item.organization_kind }),
          req.requestId,
        ],
      );
      await sendOnboardingInvitation({
        email: item.email,
        organizationName: item.organization_name,
        kind: item.organization_kind,
        token: raw,
      });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/organization-onboarding-invitations/:invitationId/revoke",
  async (req, res, next) => {
    try {
      const result = await query(
        "update organization_onboarding_invitations set status='REVOKED',revoked_at=now(),updated_at=now() where id=$1 and organization_id is null and status in ('PENDING','ACCEPTED')",
        [z.string().uuid().parse(req.params.invitationId)],
      );
      if (!result.rowCount)
        throw new AppError(
          409,
          "INVITATION_NOT_REVOCABLE",
          "This invitation cannot be revoked.",
        );
      await query(
        "insert into audit_logs(actor_user_id,action,target_type,target_id,request_id) values($1,'ORGANIZATION_ONBOARDING_INVITATION_REVOKED','organization_onboarding_invitation',$2,$3)",
        [req.user!.id, req.params.invitationId, req.requestId],
      );
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  },
);

router.post("/jurisdictions", async (req, res, next) => {
  try {
    const input = z
      .object({
        name: z.string().min(2),
        type: z.enum(["COUNTRY", "STATE", "LGA", "WARD"]),
        parentId: z.string().uuid().optional(),
        officialCode: z.string().optional(),
        geojson: z.object({
          type: z.literal("MultiPolygon"),
          coordinates: z.array(z.unknown()),
        }),
        source: z.string().min(3),
        sourceUrl: z.string().url().optional(),
        license: z.string().optional(),
      })
      .parse(req.body);
    const row = await query<{ id: string }>(
      "insert into jurisdictions(name,type,parent_id,official_code,boundary,source,source_url,license) values($1,$2,$3,$4,ST_Multi(ST_GeomFromGeoJSON($5)),$6,$7,$8) returning id",
      [
        input.name,
        input.type,
        input.parentId ?? null,
        input.officialCode ?? null,
        JSON.stringify(input.geojson),
        input.source,
        input.sourceUrl ?? null,
        input.license ?? null,
      ],
    );
    await query(
      "insert into audit_logs(actor_user_id,action,target_type,target_id,request_id) values($1,'JURISDICTION_IMPORT','jurisdiction',$2,$3)",
      [req.user!.id, row.rows[0]!.id, req.requestId],
    );
    res.status(201).json({ data: { id: row.rows[0]!.id } });
  } catch (error) {
    next(error);
  }
});

router.post(
  "/incidents/:incidentId/routing-override",
  async (req, res, next) => {
    try {
      const input = z
        .object({
          primaryOrganizationId: z.string().uuid().nullable(),
          supportingOrganizationIds: z.array(z.string().uuid()),
          reason: z.string().min(5),
        })
        .parse(req.body);
      const incidentId = z.string().uuid().parse(req.params.incidentId);
      await transaction(async (client) => {
        await client.query(
          "insert into incident_assignment_history(incident_id,organization_id,role,routing_confidence,routing_reason,routing_method,assignment_status,assigned_at,replaced_by_user_id,replacement_reason) select incident_id,organization_id,role,routing_confidence,routing_reason,routing_method,status,assigned_at,$2,$3 from incident_assignments where incident_id=$1 and status='ACTIVE'",
          [incidentId, req.user!.id, input.reason],
        );
        await client.query(
          "update incident_assignments set status='INACTIVE',ended_at=now() where incident_id=$1 and status='ACTIVE'",
          [incidentId],
        );
        if (input.primaryOrganizationId)
          await client.query(
            "insert into incident_assignments(incident_id,organization_id,role,routing_reason,routing_method,reviewed_by,reviewed_at,status,ended_at) values($1,$2,'PRIMARY',$3,'MANUAL',$4,now(),'ACTIVE',null) on conflict(incident_id,organization_id) do update set role='PRIMARY',routing_reason=excluded.routing_reason,routing_method='MANUAL',reviewed_by=excluded.reviewed_by,reviewed_at=now(),status='ACTIVE',ended_at=null",
            [
              incidentId,
              input.primaryOrganizationId,
              input.reason,
              req.user!.id,
            ],
          );
        for (const id of input.supportingOrganizationIds)
          if (id !== input.primaryOrganizationId)
            await client.query(
              "insert into incident_assignments(incident_id,organization_id,role,routing_reason,routing_method,reviewed_by,reviewed_at,status,ended_at) values($1,$2,'SUPPORTING',$3,'MANUAL',$4,now(),'ACTIVE',null) on conflict(incident_id,organization_id) do update set role='SUPPORTING',routing_reason=excluded.routing_reason,routing_method='MANUAL',reviewed_by=excluded.reviewed_by,reviewed_at=now(),status='ACTIVE',ended_at=null",
              [incidentId, id, input.reason, req.user!.id],
            );
        await client.query(
          "insert into audit_logs(actor_user_id,action,target_type,target_id,metadata,request_id) values($1,'ROUTING_OVERRIDE','incident',$2,$3,$4)",
          [req.user!.id, incidentId, JSON.stringify(input), req.requestId],
        );
        await client.query(
          "insert into incident_timeline_events(incident_id,event_type,actor_user_id,source_type,title,body,visibility,metadata) values($1,'ROUTING_OVERRIDE',$2,'ROUTING_DECISION','Incident responsibility updated',$3,'PUBLIC',$4)",
          [
            incidentId,
            req.user!.id,
            input.reason,
            JSON.stringify({
              primaryOrganizationId: input.primaryOrganizationId,
              supportingOrganizationIds: input.supportingOrganizationIds,
            }),
          ],
        );
      });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  },
);

router.post("/incidents/:incidentId/merge", async (req, res, next) => {
  try {
    const source = z.string().uuid().parse(req.params.incidentId);
    const input = z
      .object({
        targetIncidentId: z.string().uuid(),
        reason: z.string().min(5),
      })
      .parse(req.body);
    if (source === input.targetIncidentId)
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        "An incident cannot be merged into itself.",
      );
    await transaction(async (client) => {
      await client.query(
        "insert into incident_assignment_history(incident_id,organization_id,role,routing_confidence,routing_reason,routing_method,assignment_status,assigned_at,replaced_by_user_id,replacement_reason) select incident_id,organization_id,role,routing_confidence,routing_reason,routing_method,status,assigned_at,$2,$3 from incident_assignments where incident_id=$1 and status='ACTIVE'",
        [source, req.user!.id, input.reason],
      );
      await client.query(
        "update incident_assignments set status='INACTIVE',ended_at=now() where incident_id=$1 and status='ACTIVE'",
        [source],
      );
      await client.query(
        "update incident_reports set incident_id=$1 where incident_id=$2",
        [input.targetIncidentId, source],
      );
      await client.query(
        "update incidents set report_count=(select count(*) from incident_reports where incident_id=$1),updated_at=now() where id=$1",
        [input.targetIncidentId],
      );
      await client.query(
        "insert into incident_merge_history(source_incident_id,target_incident_id,action,reason,actor_user_id) values($1,$2,'MERGE',$3,$4)",
        [source, input.targetIncidentId, input.reason, req.user!.id],
      );
      await client.query(
        "update incidents set official_status='CLOSED',public_visibility='REDIRECTED',report_count=0,updated_at=now() where id=$1",
        [source],
      );
      await client.query(
        "insert into incident_timeline_events(incident_id,event_type,actor_user_id,source_type,title,body,visibility,metadata) values($1,'INCIDENT_MERGED',$2,'INCIDENT_MERGE','Related incident merged into this record',$3,'PUBLIC',$4)",
        [
          input.targetIncidentId,
          req.user!.id,
          input.reason,
          JSON.stringify({ sourceIncidentId: source }),
        ],
      );
      await client.query(
        "insert into audit_logs(actor_user_id,action,target_type,target_id,metadata,request_id) values($1,'INCIDENT_MERGE','incident',$2,$3,$4)",
        [
          req.user!.id,
          input.targetIncidentId,
          JSON.stringify({ sourceIncidentId: source, reason: input.reason }),
          req.requestId,
        ],
      );
    });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.post("/incidents/:incidentId/split", async (req, res, next) => {
  try {
    const source = z.string().uuid().parse(req.params.incidentId);
    const input = z
      .object({
        reportIds: z.array(z.string().uuid()).min(1),
        title: z.string().min(3).max(180),
        summary: z.string().min(3).max(1000),
        reason: z.string().min(5),
      })
      .parse(req.body);
    const newIncident = await transaction(async (client) => {
      const sourceRow = await client.query<{
        category: string;
        subcategory: string | null;
        location_geojson: string;
      }>(
        "select category,subcategory,ST_AsGeoJSON(location) location_geojson from incidents where id=$1 for update",
        [source],
      );
      if (!sourceRow.rowCount)
        throw new AppError(404, "NOT_FOUND", "Source incident not found.");
      const owned = await client.query(
        "select report_id from incident_reports where incident_id=$1 and report_id = any($2::uuid[])",
        [source, input.reportIds],
      );
      if (owned.rowCount !== input.reportIds.length)
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          "Every report being split must belong to the source incident.",
        );
      const row = sourceRow.rows[0]!;
      const created = await client.query<{ id: string }>(
        "insert into incidents(public_reference,title,summary,category,subcategory,location,report_count) values('CP-'||to_char(now(),'YYYY')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),$1,$2,$3,$4,ST_GeomFromGeoJSON($5),$6) returning id",
        [
          input.title,
          input.summary,
          row.category,
          row.subcategory,
          row.location_geojson,
          input.reportIds.length,
        ],
      );
      const target = created.rows[0]!.id;
      await client.query(
        "update incident_reports set incident_id=$1,matching_method='MANUAL_SPLIT' where incident_id=$2 and report_id = any($3::uuid[])",
        [target, source, input.reportIds],
      );
      await client.query(
        "update incidents set report_count=(select count(*) from incident_reports where incident_id=$1),updated_at=now() where id=$1",
        [source],
      );
      await client.query(
        "insert into incident_merge_history(source_incident_id,target_incident_id,action,reason,actor_user_id) values($1,$2,'SPLIT',$3,$4)",
        [source, target, input.reason, req.user!.id],
      );
      await client.query(
        "insert into audit_logs(actor_user_id,action,target_type,target_id,metadata,request_id) values($1,'INCIDENT_SPLIT','incident',$2,$3,$4)",
        [
          req.user!.id,
          source,
          JSON.stringify({ ...input, newIncidentId: target }),
          req.requestId,
        ],
      );
      return target;
    });
    res.status(201).json({ data: { id: newIncident } });
  } catch (error) {
    next(error);
  }
});

router.post(
  "/resolution-reviews/:reviewId/decision",
  async (req, res, next) => {
    try {
      const reviewId = z.string().uuid().parse(req.params.reviewId);
      const input = z
        .object({
          decision: z.enum(["RESPONDED", "RESOLVED"]),
          reason: z.string().trim().min(5).max(2000),
        })
        .parse(req.body);
      await transaction(async (client) => {
        const review = await client.query<{ incident_id: string }>(
          "update resolution_review_cases set status=$1,resolved_at=case when $1='RESOLVED' then now() else resolved_at end where id=$2 and status<>'RESOLVED' returning incident_id",
          [input.decision, reviewId],
        );
        if (!review.rows[0])
          throw new AppError(
            404,
            "NOT_FOUND",
            "Open resolution review not found.",
          );
        await client.query(
          "insert into audit_logs(actor_user_id,action,target_type,target_id,metadata,request_id) values($1,'RESOLUTION_REVIEW_DECISION','resolution_review',$2,$3,$4)",
          [req.user!.id, reviewId, JSON.stringify(input), req.requestId],
        );
        await client.query(
          "insert into incident_timeline_events(incident_id,event_type,actor_user_id,source_type,source_id,title,body,visibility) values($1,'RESOLUTION_REVIEW',$2,'RESOLUTION_REVIEW',$3,'CivicPulse reviewed a community resolution dispute',$4,'PUBLIC')",
          [review.rows[0].incident_id, req.user!.id, reviewId, input.reason],
        );
      });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  },
);

export default router;
