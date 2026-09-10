import { Router } from "express";
import { z } from "zod";
import { query, transaction } from "../../db/pool.js";
import { requireAuth, requirePlatformRole } from "../../middleware/auth.js";
import {
  allowedMedia,
  signEvidenceUpload,
  verifyAsset,
} from "../../providers/cloudinary.js";
import { AppError } from "../../utils/errors.js";
import {
  invitationHash,
  invitationToken,
  sendMemberInvitation,
} from "./invitations.js";
const router = Router();
const jsonArray = z.array(z.string()).default([]);
const government = z.object({
  governmentLevel: z.enum(["FEDERAL", "STATE", "LGA"]),
  organizationType: z.string().min(2),
  parentOrganizationId: z.string().uuid().optional(),
  supervisingOrganizationId: z.string().uuid().optional(),
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
        invitationToken: z.string().min(32).max(256),
        kind: z.enum(["GOVERNMENT", "NGO"]),
        officialName: z.string().min(2),
        displayName: z.string().optional(),
        acronym: z.string().optional(),
        mentionHandle: z
          .string()
          .regex(/^[A-Za-z0-9_]{2,30}$/)
          .optional(),
        slug: z.string().regex(/^[a-z0-9-]+$/),
        website: z.string().url().optional(),
        officialEmail: z.string().email().optional(),
        publicSupportEmail: z.string().email().optional(),
        intakeEmail: z.string().email().optional(),
        supportPhone: z.string().max(40).optional(),
        contactVisibility: z.enum(["PRIVATE", "PUBLIC"]).default("PRIVATE"),
        jurisdictionIds: z.array(z.string().uuid()).max(100).default([]),
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
      const invitation = await client.query<{
        id: string;
        email: string;
        organization_kind: string;
      }>(
        `select id,email,organization_kind from organization_onboarding_invitations
         where token_hash=$1 and status='ACCEPTED' and accepted_by=$2
           and organization_id is null and expires_at>now() for update`,
        [invitationHash(base.invitationToken), req.user!.id],
      );
      const access = invitation.rows[0];
      if (!access)
        throw new AppError(
          403,
          "ONBOARDING_INVITATION_REQUIRED",
          "A valid accepted organization invitation is required.",
        );
      if (
        access.organization_kind !== base.kind ||
        access.email.toLowerCase() !== req.user!.email.toLowerCase()
      )
        throw new AppError(
          403,
          "INVITATION_MISMATCH",
          "This onboarding invitation does not match the account or organization type.",
        );
      const created = await client.query<{ id: string }>(
        "insert into organizations(kind,official_name,display_name,acronym,mention_handle,slug,website,official_email,public_support_email,intake_email,phone,support_phone,address,contact_visibility) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning id",
        [
          base.kind,
          base.officialName,
          base.displayName ?? null,
          base.acronym ?? null,
          base.mentionHandle?.toUpperCase() ??
            base.acronym?.replace(/[^a-zA-Z0-9_]/g, "").toUpperCase() ??
            null,
          base.slug,
          base.website ?? null,
          base.officialEmail ?? null,
          base.publicSupportEmail ?? null,
          base.intakeEmail ?? null,
          base.phone ?? null,
          base.supportPhone ?? null,
          base.address ?? null,
          base.contactVisibility,
        ],
      );
      const id = created.rows[0]!.id;
      await client.query(
        "insert into organization_members(organization_id,user_id,role,membership_status,joined_at) values($1,$2,'ORG_ADMIN','ACTIVE',now())",
        [id, req.user!.id],
      );
      if (base.government)
        await client.query(
          "insert into government_profiles(organization_id,government_level,organization_type,parent_organization_id,supervising_organization_id,mandate_text,mandate_summary,responsibilities,exclusions,issue_categories,asset_types,ownership_roles,operational_contacts) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
          [
            id,
            base.government.governmentLevel,
            base.government.organizationType,
            base.government.parentOrganizationId ?? null,
            base.government.supervisingOrganizationId ?? null,
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
      if (base.jurisdictionIds.length)
        await client.query(
          "insert into organization_jurisdictions(organization_id,jurisdiction_id) select $1,unnest($2::uuid[]) on conflict do nothing",
          [id, base.jurisdictionIds],
        );
      await client.query(
        "update organization_onboarding_invitations set organization_id=$1,updated_at=now() where id=$2",
        [id, access.id],
      );
      await client.query(
        "insert into audit_logs(actor_user_id,actor_organization_id,action,target_type,target_id,metadata,request_id) values($1,$2,'ORGANIZATION_ONBOARDING_STARTED','organization',$2,$3,$4)",
        [
          req.user!.id,
          id,
          JSON.stringify({ invitationId: access.id, kind: base.kind }),
          req.requestId,
        ],
      );
      return id;
    });
    res.status(201).json({ data: { id: organization } });
  } catch (error) {
    next(error);
  }
});

router.get("/onboarding-options", async (_req, res, next) => {
  try {
    const [jurisdictions, organizations] = await Promise.all([
      query(
        "select id,name,type,parent_id from jurisdictions where active=true and type in ('COUNTRY','STATE','LGA') order by case type when 'COUNTRY' then 1 when 'STATE' then 2 else 3 end,name",
      ),
      query(
        "select id,coalesce(display_name,official_name) name from organizations where kind='GOVERNMENT' and active=true and verification_status in ('VERIFIED','APPROVED') order by official_name",
      ),
    ]);
    res.json({
      data: {
        jurisdictions: jurisdictions.rows,
        organizations: organizations.rows,
      },
    });
  } catch (error) {
    next(error);
  }
});
router.post(
  "/:organizationId/logo/sign-upload",
  requireAuth,
  async (req, res, next) => {
    try {
      const organizationId = z.string().uuid().parse(req.params.organizationId);
      const input = z
        .object({
          mimeType: z.string(),
          bytes: z.number().int().positive().max(5_000_000),
        })
        .parse(req.body);
      const member = await query(
        "select 1 from organization_members where organization_id=$1 and user_id=$2 and membership_status='ACTIVE' and role in ('ORG_ADMIN','MANAGER')",
        [organizationId, req.user!.id],
      );
      if (!member.rowCount)
        throw new AppError(
          403,
          "FORBIDDEN",
          "Organization administration permission is required.",
        );
      if (
        !allowedMedia.get("image")?.includes(input.mimeType) ||
        input.bytes > 5_000_000
      )
        throw new AppError(
          400,
          "INVALID_MEDIA",
          "Choose a JPG, PNG, or WebP logo smaller than 5 MB.",
        );
      res.json({
        data: signEvidenceUpload({
          scopeId: organizationId,
          purpose: "ORGANIZATION",
          kind: "image",
          mimeType: input.mimeType,
          bytes: input.bytes,
        }),
      });
    } catch (error) {
      next(error);
    }
  },
);
router.post(
  "/:organizationId/logo/verify",
  requireAuth,
  async (req, res, next) => {
    try {
      const organizationId = z.string().uuid().parse(req.params.organizationId);
      const input = z
        .object({ publicId: z.string().min(1), mimeType: z.string() })
        .parse(req.body);
      const member = await query(
        "select 1 from organization_members where organization_id=$1 and user_id=$2 and membership_status='ACTIVE' and role in ('ORG_ADMIN','MANAGER')",
        [organizationId, req.user!.id],
      );
      if (!member.rowCount)
        throw new AppError(
          403,
          "FORBIDDEN",
          "Organization administration permission is required.",
        );
      const asset = await verifyAsset(input.publicId, "image");
      const context = asset.context?.custom ?? asset.context ?? {};
      if (
        context.scope_id !== organizationId ||
        context.purpose !== "ORGANIZATION" ||
        context.kind !== "image" ||
        context.mime_type !== input.mimeType ||
        asset.resource_type !== "image" ||
        Number(asset.bytes) > 5_000_000 ||
        !allowedMedia.get("image")?.includes(input.mimeType)
      )
        throw new AppError(
          400,
          "MEDIA_VERIFICATION_FAILED",
          "Uploaded logo did not match its signed organization intent.",
        );
      await query(
        "update organizations set logo_public_id=$1,updated_at=now() where id=$2",
        [input.publicId, organizationId],
      );
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  },
);
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
router.get("/search", async (req, res, next) => {
  try {
    const input = z
      .object({
        q: z.string().trim().min(1).max(80),
        mentionable: z.coerce.boolean().default(false),
      })
      .parse(req.query);
    const term = `%${input.q}%`;
    const rows = await query(
      `select id,coalesce(display_name,official_name) name,official_name,acronym,mention_handle handle,kind,verification_status,logo_public_id from organizations where active=true and verification_status in ('VERIFIED','APPROVED') and ($1::boolean=false or mention_handle is not null) and (mention_handle ilike $2 or acronym ilike $2 or official_name ilike $2 or display_name ilike $2) order by case when mention_handle ilike $3 then 0 when acronym ilike $3 then 1 else 2 end,official_name limit 10`,
      [input.mentionable, term, `${input.q}%`],
    );
    res.json({ data: rows.rows });
  } catch (e) {
    next(e);
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
      "select o.id,o.kind,o.official_name,o.display_name,o.acronym,o.slug,o.logo_public_id,o.description,o.website,o.verification_status,gp.government_level,gp.organization_type,gp.mandate_summary,gp.issue_categories,gp.asset_types,np.mission,np.focus_areas,np.geographic_scope,np.capabilities from organizations o left join government_profiles gp on gp.organization_id=o.id left join ngo_profiles np on np.organization_id=o.id where o.id=$1 and o.active=true and o.verification_status in ('VERIFIED','APPROVED')",
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
      const row = await transaction(async (client) => {
        const inserted = await client.query<{ id: string }>(
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
        await client.query(
          "update organizations set onboarding_status=case when verification_status='VERIFIED' then 'CHANGES_REQUESTED' else onboarding_status end,verification_status=case when verification_status='VERIFIED' then 'UNVERIFIED' else verification_status end,updated_at=now() where id=$1",
          [organizationId],
        );
        await client.query(
          "insert into audit_logs(actor_user_id,actor_organization_id,action,target_type,target_id,metadata,request_id) values($1,$2,'MANDATE_SOURCE_ADDED','organization',$2,$3,$4)",
          [
            req.user!.id,
            organizationId,
            JSON.stringify({ sourceId: inserted.rows[0]!.id }),
            req.requestId,
          ],
        );
        return inserted;
      });
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
      "select ms.id,ms.title,ms.source_type,ms.source_url,ms.issuing_authority,ms.effective_date,ms.version,ms.verified_at from organization_mandate_sources ms join organizations o on o.id=ms.organization_id where ms.organization_id=$1 and o.active=true and o.verification_status='VERIFIED' order by ms.created_at",
      [organizationId],
    );
    res.json({ data: rows.rows });
  } catch (error) {
    next(error);
  }
});
router.post(
  "/:organizationId/member-invitations",
  requireAuth,
  async (req, res, next) => {
    try {
      const organizationId = z.string().uuid().parse(req.params.organizationId);
      const input = z
        .object({
          email: z
            .string()
            .email()
            .transform((value) => value.toLowerCase()),
          role: z.enum(["MEMBER", "OFFICER", "MANAGER", "ORG_ADMIN"]),
        })
        .parse(req.body);
      const access = await query<{ name: string }>(
        `select coalesce(o.display_name,o.official_name) name
         from organization_members m join organizations o on o.id=m.organization_id
         where m.organization_id=$1 and m.user_id=$2 and m.membership_status='ACTIVE'
           and m.role='ORG_ADMIN' and o.active=true and o.verification_status='VERIFIED'`,
        [organizationId, req.user!.id],
      );
      const organization = access.rows[0];
      if (!organization)
        throw new AppError(
          403,
          "FORBIDDEN",
          "A verified organization administrator is required.",
        );
      const raw = invitationToken();
      const created = await transaction(async (client) => {
        await client.query(
          "update organization_member_invitations set status='REVOKED',revoked_at=now(),updated_at=now() where organization_id=$1 and lower(email)=lower($2) and status='PENDING'",
          [organizationId, input.email],
        );
        const result = await client.query<{ id: string }>(
          "insert into organization_member_invitations(organization_id,email,role,token_hash,invited_by,expires_at) values($1,$2,$3,$4,$5,now()+interval '7 days') returning id",
          [
            organizationId,
            input.email,
            input.role,
            invitationHash(raw),
            req.user!.id,
          ],
        );
        await client.query(
          "insert into audit_logs(actor_user_id,actor_organization_id,action,target_type,target_id,metadata,request_id) values($1,$2,'ORGANIZATION_MEMBER_INVITED','organization_member_invitation',$3,$4,$5)",
          [
            req.user!.id,
            organizationId,
            result.rows[0]!.id,
            JSON.stringify({ role: input.role }),
            req.requestId,
          ],
        );
        return result.rows[0]!;
      });
      await sendMemberInvitation({
        email: input.email,
        organizationName: organization.name,
        token: raw,
      });
      res.status(201).json({ data: { id: created.id, status: "PENDING" } });
    } catch (error) {
      next(error);
    }
  },
);
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
