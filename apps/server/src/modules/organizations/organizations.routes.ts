import { Router } from "express";
import { z } from "zod";
import { query, transaction } from "../../db/pool.js";
import { requireAuth, requirePlatformRole } from "../../middleware/auth.js";
import { AppError } from "../../utils/errors.js";
const router = Router();
const jsonArray = z.array(z.string()).default([]);
const government = z.object({
  governmentLevel: z.enum(["FEDERAL", "STATE", "LGA"]),
  organizationType: z.string().min(2),
  mandateText: z.string().min(30),
  mandateSummary: z.string().optional(),
  responsibilities: jsonArray,
  exclusions: jsonArray,
  issueCategories: jsonArray,
  assetTypes: jsonArray,
  ownershipRoles: jsonArray,
  operationalContacts: z.record(z.unknown()).default({}),
});
const ngo = z.object({
  registrationAuthority: z.string().optional(),
  registrationNumber: z.string().optional(),
  legalForm: z.string().optional(),
  mission: z.string().min(20),
  focusAreas: jsonArray,
  geographicScope: jsonArray,
  capabilities: jsonArray,
  technicalCapacity: z.record(z.unknown()).default({}),
  fundingProfile: z.record(z.unknown()).default({}),
  projectHistory: z.array(z.record(z.unknown())).default([]),
});
router.post("/", requireAuth, async (req, res, next) => {
  try {
    const base = z
      .object({
        kind: z.enum(["GOVERNMENT", "NGO"]),
        officialName: z.string().min(2),
        displayName: z.string().optional(),
        acronym: z.string().optional(),
        slug: z.string().regex(/^[a-z0-9-]+$/),
        website: z.string().url().optional(),
        officialEmail: z.string().email().optional(),
        phone: z.string().optional(),
        address: z.string().optional(),
        government: government.optional(),
        ngo: ngo.optional(),
      })
      .parse(req.body);
    if ((base.kind === "GOVERNMENT") !== Boolean(base.government))
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        "Government details are required for government organizations.",
      );
    if ((base.kind === "NGO") !== Boolean(base.ngo))
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        "NGO details are required for NGOs.",
      );
    const organization = await transaction(async (client) => {
      const created = await client.query<{ id: string }>(
        "insert into organizations(kind,official_name,display_name,acronym,slug,website,official_email,phone,address) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id",
        [
          base.kind,
          base.officialName,
          base.displayName ?? null,
          base.acronym ?? null,
          base.slug,
          base.website ?? null,
          base.officialEmail ?? null,
          base.phone ?? null,
          base.address ?? null,
        ],
      );
      const id = created.rows[0]!.id;
      await client.query(
        "insert into organization_members(organization_id,user_id,role,membership_status,joined_at) values($1,$2,'ORG_ADMIN','ACTIVE',now())",
        [id, req.user!.id],
      );
      if (base.government)
        await client.query(
          "insert into government_profiles(organization_id,government_level,organization_type,mandate_text,mandate_summary,responsibilities,exclusions,issue_categories,asset_types,ownership_roles,operational_contacts) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
          [
            id,
            base.government.governmentLevel,
            base.government.organizationType,
            base.government.mandateText,
            base.government.mandateSummary ?? null,
            JSON.stringify(base.government.responsibilities),
            JSON.stringify(base.government.exclusions),
            JSON.stringify(base.government.issueCategories),
            JSON.stringify(base.government.assetTypes),
            JSON.stringify(base.government.ownershipRoles),
            JSON.stringify(base.government.operationalContacts),
          ],
        );
      if (base.ngo)
        await client.query(
          "insert into ngo_profiles(organization_id,registration_authority,registration_number,legal_form,mission,focus_areas,geographic_scope,capabilities,technical_capacity,funding_profile,project_history) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
          [
            id,
            base.ngo.registrationAuthority ?? null,
            base.ngo.registrationNumber ?? null,
            base.ngo.legalForm ?? null,
            base.ngo.mission,
            JSON.stringify(base.ngo.focusAreas),
            JSON.stringify(base.ngo.geographicScope),
            JSON.stringify(base.ngo.capabilities),
            JSON.stringify(base.ngo.technicalCapacity),
            JSON.stringify(base.ngo.fundingProfile),
            JSON.stringify(base.ngo.projectHistory),
          ],
        );
      return id;
    });
    res.status(201).json({ data: { id: organization } });
  } catch (error) {
    next(error);
  }
});
router.patch("/:organizationId", requireAuth, async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.organizationId);
    const member = await query(
      "select role from organization_members where organization_id=$1 and user_id=$2 and membership_status='ACTIVE'",
      [id, req.user!.id],
    );
    if (
      !member.rowCount ||
      !["ORG_ADMIN", "MANAGER"].includes(
        (member.rows[0] as { role: string }).role,
      )
    )
      throw new AppError(
        403,
        "FORBIDDEN",
        "Organization administration permission is required.",
      );
    const input = z
      .object({
        description: z.string().max(2000).optional(),
        website: z.string().url().optional(),
        officialEmail: z.string().email().optional(),
        phone: z.string().optional(),
        address: z.string().optional(),
        logoPublicId: z.string().optional(),
        submit: z.boolean().optional(),
      })
      .parse(req.body);
    await query(
      "update organizations set description=coalesce($1,description),website=coalesce($2,website),official_email=coalesce($3,official_email),phone=coalesce($4,phone),address=coalesce($5,address),logo_public_id=coalesce($6,logo_public_id),onboarding_status=case when $7 then 'SUBMITTED' else onboarding_status end,submitted_at=case when $7 then now() else submitted_at end,updated_at=now() where id=$8",
      [
        input.description ?? null,
        input.website ?? null,
        input.officialEmail ?? null,
        input.phone ?? null,
        input.address ?? null,
        input.logoPublicId ?? null,
        input.submit ?? false,
        id,
      ],
    );
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});
router.get("/", async (_req, res, next) => {
  try {
    const rows = await query(
      "select id,kind,official_name,display_name,acronym,slug,logo_public_id,description,website,verification_status from organizations where active=true and verification_status in ('VERIFIED','APPROVED') order by official_name",
    );
    res.json({ data: rows.rows });
  } catch (error) {
    next(error);
  }
});
router.get("/:organizationId", async (req, res, next) => {
  try {
    const result = await query(
      "select o.*,gp.government_level,gp.organization_type,gp.mandate_summary,np.mission,np.focus_areas,np.capabilities from organizations o left join government_profiles gp on gp.organization_id=o.id left join ngo_profiles np on np.organization_id=o.id where o.id=$1",
      [z.string().uuid().parse(req.params.organizationId)],
    );
    if (!result.rowCount)
      throw new AppError(404, "NOT_FOUND", "Organization not found.");
    res.json({ data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});
router.get(
  "/admin/queue",
  requireAuth,
  requirePlatformRole("CIVICPULSE_ADMIN"),
  async (_req, res, next) => {
    try {
      const rows = await query(
        "select id,kind,official_name,onboarding_status,verification_status,submitted_at from organizations where onboarding_status in ('SUBMITTED','CHANGES_REQUESTED') order by submitted_at asc",
      );
      res.json({ data: rows.rows });
    } catch (error) {
      next(error);
    }
  },
);
router.post(
  "/admin/:organizationId/review",
  requireAuth,
  requirePlatformRole("CIVICPULSE_ADMIN"),
  async (req, res, next) => {
    try {
      const input = z
        .object({
          decision: z.enum(["APPROVED", "REJECTED", "CHANGES_REQUESTED"]),
          notes: z.string().min(3),
        })
        .parse(req.body);
      const id = z.string().uuid().parse(req.params.organizationId);
      await transaction(async (client) => {
        await client.query(
          "update organizations set onboarding_status=$1,verification_status=$2,review_notes=$3,reviewed_at=now(),reviewed_by=$4 where id=$5",
          [
            input.decision,
            input.decision === "APPROVED" ? "VERIFIED" : "UNVERIFIED",
            input.notes,
            req.user!.id,
            id,
          ],
        );
        await client.query(
          "insert into audit_logs(actor_user_id,action,target_type,target_id,metadata,request_id) values($1,'ORGANIZATION_REVIEW','organization',$2,$3,$4)",
          [req.user!.id, id, JSON.stringify(input), req.requestId],
        );
      });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  },
);
router.post(
  "/:organizationId/mandate-sources",
  requireAuth,
  async (req, res, next) => {
    try {
      const organizationId = z.string().uuid().parse(req.params.organizationId);
      const input = z
        .object({
          title: z.string().min(3),
          sourceType: z.string().min(2),
          sourceUrl: z.string().url().optional(),
          issuingAuthority: z.string().optional(),
          effectiveDate: z.string().date().optional(),
          version: z.string().optional(),
          documentPublicId: z.string().optional(),
          notes: z.string().max(2000).optional(),
        })
        .parse(req.body);
      const membership = await query(
        "select 1 from organization_members where organization_id=$1 and user_id=$2 and membership_status='ACTIVE' and role in ('ORG_ADMIN','MANAGER')",
        [organizationId, req.user!.id],
      );
      if (!membership.rowCount)
        throw new AppError(
          403,
          "FORBIDDEN",
          "Organization administration permission is required.",
        );
      const row = await query<{ id: string }>(
        "insert into organization_mandate_sources(organization_id,title,source_type,source_url,issuing_authority,effective_date,version,document_public_id,notes) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id",
        [
          organizationId,
          input.title,
          input.sourceType,
          input.sourceUrl ?? null,
          input.issuingAuthority ?? null,
          input.effectiveDate ?? null,
          input.version ?? null,
          input.documentPublicId ?? null,
          input.notes ?? null,
        ],
      );
      res.status(201).json({ data: { id: row.rows[0]!.id } });
    } catch (error) {
      next(error);
    }
  },
);
router.get("/:organizationId/mandate-sources", async (req, res, next) => {
  try {
    const organizationId = z.string().uuid().parse(req.params.organizationId);
    const rows = await query(
      "select id,title,source_type,source_url,issuing_authority,effective_date,version,document_public_id,notes,verified_at from organization_mandate_sources where organization_id=$1 order by created_at",
      [organizationId],
    );
    res.json({ data: rows.rows });
  } catch (error) {
    next(error);
  }
});
router.post("/:organizationId/members", requireAuth, async (req, res, next) => {
  try {
    const organizationId = z.string().uuid().parse(req.params.organizationId);
    const input = z
      .object({
        email: z.string().email(),
        role: z.enum(["MEMBER", "OFFICER", "MANAGER", "ORG_ADMIN"]),
      })
      .parse(req.body);
    const admin = await query(
      "select 1 from organization_members where organization_id=$1 and user_id=$2 and membership_status='ACTIVE' and role='ORG_ADMIN'",
      [organizationId, req.user!.id],
    );
    if (!admin.rowCount)
      throw new AppError(
        403,
        "FORBIDDEN",
        "Organization administrator permission is required.",
      );
    const user = await query<{ id: string }>(
      "select id from users where lower(email)=lower($1)",
      [input.email],
    );
    if (!user.rowCount)
      throw new AppError(
        404,
        "USER_NOT_FOUND",
        "The invitee must register a CivicPulse account before being invited.",
      );
    await query(
      "insert into organization_members(organization_id,user_id,role,membership_status,invited_by) values($1,$2,$3,'PENDING',$4) on conflict(organization_id,user_id) do update set role=excluded.role,membership_status='PENDING',invited_by=excluded.invited_by",
      [organizationId, user.rows[0]!.id, input.role, req.user!.id],
    );
    res.status(201).json({ data: { status: "PENDING" } });
  } catch (error) {
    next(error);
  }
});
router.post(
  "/:organizationId/members/accept",
  requireAuth,
  async (req, res, next) => {
    try {
      const organizationId = z.string().uuid().parse(req.params.organizationId);
      const result = await query(
        "update organization_members set membership_status='ACTIVE',joined_at=now() where organization_id=$1 and user_id=$2 and membership_status='PENDING'",
        [organizationId, req.user!.id],
      );
      if (!result.rowCount)
        throw new AppError(
          404,
          "NOT_FOUND",
          "No pending invitation was found.",
        );
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  },
);
export default router;
