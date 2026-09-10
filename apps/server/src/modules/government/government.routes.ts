import { incidentStatuses, issueCategories } from "@civicpulse/shared";
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import * as service from "./government.service.js";
import * as interventions from "../interventions/interventions.service.js";
import { requireAssignedGovernment } from "../authorization.js";
import {
  allowedMedia,
  mediaLimits,
  signEvidenceUpload,
  verifyAsset,
} from "../../providers/cloudinary.js";
import { query } from "../../db/pool.js";
import { AppError } from "../../utils/errors.js";
const router = Router();
router.use(requireAuth);
const uuid = z.string().uuid();
const org = z.object({ organizationId: z.string().uuid() });
router.get("/overview", async (req, res, next) => {
  try {
    const q = org.parse(req.query);
    res.json({ data: await service.overview(req.user!.id, q.organizationId) });
  } catch (error) {
    next(error);
  }
});
router.get("/incidents", async (req, res, next) => {
  try {
    const q = org
      .extend({
        status: z.enum(incidentStatuses).optional(),
        category: z.enum(issueCategories).optional(),
      })
      .parse(req.query);
    res.json({
      data: await service.listAssigned(req.user!.id, q.organizationId, q),
    });
  } catch (e) {
    next(e);
  }
});
router.get("/map", async (req, res, next) => {
  try {
    const q = org
      .extend({
        status: z.enum(incidentStatuses).optional(),
        category: z.enum(issueCategories).optional(),
      })
      .parse(req.query);
    res.json({
      data: await service.listAssigned(req.user!.id, q.organizationId, q),
    });
  } catch (error) {
    next(error);
  }
});
router.get("/intervention-approvals", async (req, res, next) => {
  try {
    const q = org.parse(req.query);
    res.json({
      data: await service.listApprovalRequests(req.user!.id, q.organizationId),
    });
  } catch (error) {
    next(error);
  }
});
router.get("/coordination", async (req, res, next) => {
  try {
    const q = org.parse(req.query);
    res.json({
      data: await service.listCoordinationRequests(
        req.user!.id,
        q.organizationId,
      ),
    });
  } catch (error) {
    next(error);
  }
});
router.get("/incidents/:incidentId", async (req, res, next) => {
  try {
    const q = org.parse(req.query);
    res.json({
      data: await service.detail(
        req.user!.id,
        q.organizationId,
        uuid.parse(req.params.incidentId),
      ),
    });
  } catch (e) {
    next(e);
  }
});
router.get("/evidence/:evidenceId/delivery", async (req, res, next) => {
  try {
    const q = org.parse(req.query);
    res.json({
      data: await service.evidenceDelivery(
        req.user!.id,
        q.organizationId,
        uuid.parse(req.params.evidenceId),
      ),
    });
  } catch (error) {
    next(error);
  }
});
router.post("/incidents/:incidentId/acknowledge", async (req, res, next) => {
  try {
    const b = org.parse(req.body);
    await service.acknowledge(
      req.user!.id,
      b.organizationId,
      uuid.parse(req.params.incidentId),
    );
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
router.post("/incidents/:incidentId/status", async (req, res, next) => {
  try {
    const b = org
      .extend({
        status: z.enum(incidentStatuses),
        reason: z.string().trim().max(2000).optional(),
      })
      .parse(req.body);
    await service.transition(
      req.user!.id,
      b.organizationId,
      uuid.parse(req.params.incidentId),
      b.status,
      b.reason,
    );
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
router.post("/incidents/:incidentId/updates", async (req, res, next) => {
  try {
    const b = org
      .extend({
        type: z.enum([
          "ACKNOWLEDGEMENT",
          "INSPECTION_SCHEDULED",
          "INSPECTION_COMPLETED",
          "CLARIFICATION",
          "WORK_PLANNED",
          "DEPENDENCY",
          "DELAY",
          "WORK_STARTED",
          "MILESTONE",
          "GENERAL",
        ]),
        body: z.string().trim().min(1).max(6000),
        visibility: z.enum(["PUBLIC", "INTERNAL"]).default("PUBLIC"),
      })
      .parse(req.body);
    res.status(201).json({
      data: await service.addUpdate(
        req.user!.id,
        b.organizationId,
        uuid.parse(req.params.incidentId),
        b,
      ),
    });
  } catch (e) {
    next(e);
  }
});
router.post("/incidents/:incidentId/routing-review", async (req, res, next) => {
  try {
    const b = org
      .extend({ reason: z.string().trim().min(5).max(2000) })
      .parse(req.body);
    res.status(201).json({
      data: await service.requestRoutingReview(
        req.user!.id,
        b.organizationId,
        uuid.parse(req.params.incidentId),
        b.reason,
      ),
    });
  } catch (e) {
    next(e);
  }
});
router.post("/incidents/:incidentId/resolution", async (req, res, next) => {
  try {
    const b = org
      .extend({
        statement: z.string().trim().min(10).max(6000),
        completionDate: z.string().date(),
        evidenceIds: z.array(z.string().uuid()).default([]),
        exemptionReason: z.string().trim().min(10).optional(),
      })
      .parse(req.body);
    await service.submitResolution(
      req.user!.id,
      b.organizationId,
      uuid.parse(req.params.incidentId),
      b as Parameters<typeof service.submitResolution>[3],
    );
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
router.post(
  "/incidents/:incidentId/evidence/sign-upload",
  async (req, res, next) => {
    try {
      const incidentId = uuid.parse(req.params.incidentId);
      const b = org
        .extend({
          mediaKind: z.enum(["image", "audio", "video"]),
          mimeType: z.string(),
          bytes: z.number().int().positive(),
        })
        .parse(req.body);
      await requireAssignedGovernment(
        req.user!.id,
        b.organizationId,
        incidentId,
        ["OFFICER", "MANAGER", "ORG_ADMIN"],
      );
      if (
        !allowedMedia.get(b.mediaKind)?.includes(b.mimeType) ||
        b.bytes > mediaLimits[b.mediaKind].bytes
      )
        throw new AppError(
          400,
          "INVALID_MEDIA",
          "The evidence type or size is not allowed.",
        );
      res.json({
        data: signEvidenceUpload({
          scopeId: incidentId,
          purpose: "GOVERNMENT",
          kind: b.mediaKind,
          mimeType: b.mimeType,
          bytes: b.bytes,
        }),
      });
    } catch (error) {
      next(error);
    }
  },
);
router.post(
  "/incidents/:incidentId/evidence/verify",
  async (req, res, next) => {
    try {
      const incidentId = uuid.parse(req.params.incidentId);
      const b = org
        .extend({
          publicId: z.string().min(1),
          resourceType: z.enum(["image", "video"]),
          mimeType: z.string(),
          mediaKind: z.enum(["image", "audio", "video"]),
          evidenceKind: z.enum(["INSPECTION", "PROGRESS", "RESOLUTION"]),
          description: z.string().trim().max(2000).optional(),
          visibility: z.enum(["PUBLIC", "RESTRICTED"]).default("RESTRICTED"),
        })
        .parse(req.body);
      await requireAssignedGovernment(
        req.user!.id,
        b.organizationId,
        incidentId,
        ["OFFICER", "MANAGER", "ORG_ADMIN"],
      );
      const asset = await verifyAsset(b.publicId, b.resourceType);
      const context = asset.context?.custom ?? asset.context ?? {};
      if (
        context.scope_id !== incidentId ||
        context.purpose !== "GOVERNMENT" ||
        context.kind !== b.mediaKind ||
        context.mime_type !== b.mimeType ||
        asset.resource_type !== b.resourceType ||
        Number(asset.bytes) > mediaLimits[b.mediaKind].bytes
      )
        throw new AppError(
          400,
          "MEDIA_VERIFICATION_FAILED",
          "Uploaded evidence did not match its signed government intent.",
        );
      const created = await query<{ id: string }>(
        "insert into incident_evidence(incident_id,uploader_user_id,uploader_organization_id,kind,cloudinary_public_id,resource_type,format,mime_type,description,visibility,moderation_status) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'PENDING') returning id",
        [
          incidentId,
          req.user!.id,
          b.organizationId,
          b.evidenceKind,
          b.publicId,
          b.resourceType,
          asset.format ?? null,
          b.mimeType,
          b.description ?? null,
          b.visibility,
        ],
      );
      res.status(201).json({ data: created.rows[0] });
    } catch (error) {
      next(error);
    }
  },
);
router.post(
  "/incidents/:incidentId/supporting-organizations",
  async (req, res, next) => {
    try {
      const b = org
        .extend({
          invitedOrganizationId: z.string().uuid(),
          reason: z.string().trim().min(5).max(2000),
        })
        .parse(req.body);
      res.status(201).json({
        data: await service.inviteSupporting(
          req.user!.id,
          b.organizationId,
          uuid.parse(req.params.incidentId),
          b.invitedOrganizationId,
          b.reason,
        ),
      });
    } catch (e) {
      next(e);
    }
  },
);
router.post("/coordination/:requestId/:decision", async (req, res, next) => {
  try {
    const decision = z.enum(["accept", "decline"]).parse(req.params.decision);
    await service.respondCoordination(
      req.user!.id,
      uuid.parse(req.params.requestId),
      decision === "accept",
    );
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
router.post("/interventions/:id/review", async (req, res, next) => {
  try {
    const b = org
      .extend({
        status: z.enum([
          "UNDER_REVIEW",
          "CHANGES_REQUESTED",
          "REJECTED",
          "APPROVED_IN_PRINCIPLE",
          "AWAITING_APPROVALS",
          "EXPIRED",
          "EXPIRED",
        ]),
        reason: z.string().max(2000).optional(),
      })
      .parse(req.body);
    await interventions.governmentReview(
      req.user!.id,
      b.organizationId,
      uuid.parse(req.params.id),
      b.status,
      b.reason,
    );
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
router.post("/interventions/:id/approvals", async (req, res, next) => {
  try {
    const b = org
      .extend({
        authorityOrganizationId: uuid,
        approvalType: z.string().min(2).max(120),
        reason: z.string().min(3).max(2000),
        requiredDocuments: z.array(z.string().max(120)).default([]),
      })
      .parse(req.body);
    res.status(201).json({
      data: await interventions.addApproval(
        req.user!.id,
        b.organizationId,
        uuid.parse(req.params.id),
        b,
      ),
    });
  } catch (e) {
    next(e);
  }
});
router.post("/intervention-approvals/:id/decision", async (req, res, next) => {
  try {
    const b = org
      .extend({
        decision: z.enum(["SATISFIED", "REJECTED"]),
        conditions: z.string().max(2000).optional(),
        issuedDocumentPublicId: z.string().max(500).optional(),
        expiresAt: z.string().datetime().optional(),
      })
      .parse(req.body);
    await interventions.decideApproval(
      req.user!.id,
      b.organizationId,
      uuid.parse(req.params.id),
      b as Parameters<typeof interventions.decideApproval>[3],
    );
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
router.post("/interventions/:id/authorize", async (req, res, next) => {
  try {
    const b = org.parse(req.body);
    await interventions.authorize(
      req.user!.id,
      b.organizationId,
      uuid.parse(req.params.id),
    );
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
router.post("/interventions/:id/inspection", async (req, res, next) => {
  try {
    const b = org
      .extend({
        decision: z.enum(["ACCEPTED", "REMEDIATION_REQUIRED", "REJECTED"]),
        notes: z.string().min(5).max(4000),
      })
      .parse(req.body);
    await interventions.inspect(
      req.user!.id,
      b.organizationId,
      uuid.parse(req.params.id),
      b.decision,
      b.notes,
    );
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
router.post("/interventions/:id/handover", async (req, res, next) => {
  try {
    const b = org
      .extend({ notes: z.string().min(5).max(4000) })
      .parse(req.body);
    await interventions.handover(
      req.user!.id,
      b.organizationId,
      uuid.parse(req.params.id),
      b.notes,
    );
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
export default router;
