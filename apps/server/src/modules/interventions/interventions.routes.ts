import { interventionTypes } from "@civicpulse/shared";
import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import * as service from "./interventions.service.js";
import { requireMembership } from "../authorization.js";
import { query } from "../../db/pool.js";
import {
  allowedMedia,
  mediaLimits,
  signEvidenceUpload,
  verifyAsset,
} from "../../providers/cloudinary.js";
import { AppError } from "../../utils/errors.js";
const router = Router(),
  uuid = z.string().uuid(),
  types = z.array(z.enum(interventionTypes)).min(1);
const proposalPayload = z.object({
  problemUnderstanding: z.string().trim().min(10).max(5000),
  proposedScope: z.string().trim().min(10).max(8000),
  exclusions: z.array(z.string().trim().min(1).max(500)).default([]),
  method: z.string().trim().max(5000).optional(),
  risks: z.array(z.string().trim().min(1).max(1000)).default([]),
  environmentalSafeguards: z.string().trim().max(4000).optional(),
  communityTrafficManagement: z.string().trim().max(4000).optional(),
  technicalAssessment: z.string().trim().max(5000).optional(),
  requestedGovernmentAction: z.string().trim().min(5).max(4000),
});
router.get("/issues", async (req, res, next) => {
  try {
    const b = z
      .object({
        category: z.string().optional(),
        stateId: uuid.optional(),
        lgaId: uuid.optional(),
        status: z.string().optional(),
      })
      .parse(req.query);
    res.json({
      data: await service.discover(b as Parameters<typeof service.discover>[0]),
    });
  } catch (e) {
    next(e);
  }
});
router.use(requireAuth);
router.get("/overview", async (req, res, next) => {
  try {
    const q = z.object({ organizationId: uuid }).parse(req.query);
    res.json({ data: await service.overview(req.user!.id, q.organizationId) });
  } catch (error) {
    next(error);
  }
});
router.get("/map", async (req, res, next) => {
  try {
    const b = z
      .object({
        category: z.string().optional(),
        stateId: uuid.optional(),
        lgaId: uuid.optional(),
        status: z.string().optional(),
      })
      .parse(req.query);
    res.json({
      data: await service.discover(b as Parameters<typeof service.discover>[0]),
    });
  } catch (error) {
    next(error);
  }
});
const expressInterest = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const b = z
      .object({
        organizationId: uuid,
        participationTypes: types,
        note: z.string().max(1000).optional(),
        visibility: z.enum(["PUBLIC", "PRIVATE"]).default("PRIVATE"),
      })
      .parse(req.body);
    res.status(201).json({
      data: await service.interest(
        req.user!.id,
        b.organizationId,
        uuid.parse(req.params.incidentId),
        b as Parameters<typeof service.interest>[3],
      ),
    });
  } catch (e) {
    next(e);
  }
};
router.post("/issues/:incidentId/interest", expressInterest);
router.put("/issues/:incidentId/interest", expressInterest);
router.delete("/issues/:incidentId/interest", async (req, res, next) => {
  try {
    const b = z.object({ organizationId: uuid }).parse(req.body);
    await service.removeInterest(
      req.user!.id,
      b.organizationId,
      uuid.parse(req.params.incidentId),
    );
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
const proposal = z
  .object({
    organizationId: uuid,
    incidentId: uuid,
    interventionTypes: types,
    physicalWork: z.boolean(),
    budgetAmount: z.number().nonnegative().optional(),
    currency: z
      .string()
      .length(3)
      .transform((x) => x.toUpperCase())
      .optional(),
    fundingStatus: z.string().max(100).optional(),
    plannedStart: z.string().date().optional(),
    plannedEnd: z.string().date().optional(),
    payload: proposalPayload,
  })
  .superRefine((value, context) => {
    if (
      value.physicalWork &&
      !value.interventionTypes.some((type) =>
        ["EXECUTE", "FUND_AND_EXECUTE"].includes(type),
      )
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["interventionTypes"],
        message: "Physical work requires an execution intervention type.",
      });
    if (
      value.plannedStart &&
      value.plannedEnd &&
      value.plannedEnd < value.plannedStart
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["plannedEnd"],
        message: "Planned end must not precede planned start.",
      });
  });
router.post("/interventions", async (req, res, next) => {
  try {
    res.status(201).json({
      data: await service.createProposal(
        req.user!.id,
        proposal.parse(req.body) as Parameters<
          typeof service.createProposal
        >[1],
      ),
    });
  } catch (e) {
    next(e);
  }
});
router.get("/interventions", async (req, res, next) => {
  try {
    const q = z.object({ organizationId: uuid }).parse(req.query);
    res.json({
      data: await service.listForOrganization(req.user!.id, q.organizationId),
    });
  } catch (e) {
    next(e);
  }
});
async function requireOwnedProposal(
  userId: string,
  organizationId: string,
  proposalId: string,
) {
  await requireMembership(userId, organizationId, "NGO", [
    "OFFICER",
    "MANAGER",
    "ORG_ADMIN",
  ]);
  const proposal = await query<{ incident_id: string }>(
    "select incident_id from intervention_proposals where id=$1 and lead_organization_id=$2",
    [proposalId, organizationId],
  );
  if (!proposal.rows[0])
    throw new AppError(404, "NOT_FOUND", "Intervention proposal not found.");
  return proposal.rows[0];
}
router.post(
  "/interventions/:id/documents/sign-upload",
  async (req, res, next) => {
    try {
      const proposalId = uuid.parse(req.params.id);
      const b = z
        .object({
          organizationId: uuid,
          mediaKind: z.enum(["image", "audio", "video"]),
          mimeType: z.string(),
          bytes: z.number().int().positive(),
        })
        .parse(req.body);
      await requireOwnedProposal(req.user!.id, b.organizationId, proposalId);
      if (
        !allowedMedia.get(b.mediaKind)?.includes(b.mimeType) ||
        b.bytes > mediaLimits[b.mediaKind].bytes
      )
        throw new AppError(
          400,
          "INVALID_MEDIA",
          "The document type or size is not allowed.",
        );
      res.json({
        data: signEvidenceUpload({
          scopeId: proposalId,
          purpose: "INTERVENTION",
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
router.post("/interventions/:id/documents/verify", async (req, res, next) => {
  try {
    const proposalId = uuid.parse(req.params.id);
    const b = z
      .object({
        organizationId: uuid,
        publicId: z.string().min(1),
        resourceType: z.enum(["image", "video"]),
        mediaKind: z.enum(["image", "audio", "video"]),
        mimeType: z.string(),
        documentType: z.enum([
          "PROPOSAL",
          "TECHNICAL",
          "FINANCE",
          "CONTRACT",
          "APPROVAL",
          "MILESTONE",
        ]),
        title: z.string().trim().min(2).max(180),
        visibility: z.enum(["RESTRICTED", "PUBLIC"]).default("RESTRICTED"),
      })
      .parse(req.body);
    const proposal = await requireOwnedProposal(
      req.user!.id,
      b.organizationId,
      proposalId,
    );
    const asset = await verifyAsset(b.publicId, b.resourceType);
    const context = asset.context?.custom ?? asset.context ?? {};
    if (
      context.scope_id !== proposalId ||
      context.purpose !== "INTERVENTION" ||
      context.kind !== b.mediaKind ||
      context.mime_type !== b.mimeType ||
      asset.resource_type !== b.resourceType ||
      Number(asset.bytes) > mediaLimits[b.mediaKind].bytes
    )
      throw new AppError(
        400,
        "MEDIA_VERIFICATION_FAILED",
        "Uploaded document did not match its signed intervention intent.",
      );
    const document = await query<{ id: string }>(
      "insert into intervention_documents(proposal_id,uploaded_by,document_type,title,cloudinary_public_id,resource_type,format,mime_type,visibility) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id",
      [
        proposalId,
        req.user!.id,
        b.documentType,
        b.title,
        b.publicId,
        b.resourceType,
        asset.format ?? null,
        b.mimeType,
        b.visibility,
      ],
    );
    await query(
      "insert into incident_timeline_events(incident_id,event_type,actor_user_id,actor_organization_id,source_type,source_id,title,visibility) values($1,'INTERVENTION_DOCUMENT',$2,$3,'INTERVENTION_DOCUMENT',$4,'Intervention evidence submitted','PUBLIC')",
      [
        proposal.incident_id,
        req.user!.id,
        b.organizationId,
        document.rows[0]!.id,
      ],
    );
    res.status(201).json({ data: document.rows[0] });
  } catch (error) {
    next(error);
  }
});
router.patch("/interventions/:id", async (req, res, next) => {
  try {
    const b = z
      .object({
        organizationId: uuid,
        interventionTypes: types.optional(),
        physicalWork: z.boolean().optional(),
        payload: proposalPayload.optional(),
      })
      .parse(req.body);
    await service.updateProposal(
      req.user!.id,
      uuid.parse(req.params.id),
      b as Parameters<typeof service.updateProposal>[2],
    );
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
for (const action of ["submit", "resubmit", "withdraw"] as const)
  router.post(`/interventions/:id/${action}`, async (req, res, next) => {
    try {
      const b = z.object({ organizationId: uuid }).parse(req.body);
      await service.ngoTransition(
        req.user!.id,
        b.organizationId,
        uuid.parse(req.params.id),
        action === "submit"
          ? "SUBMITTED"
          : action === "resubmit"
            ? "RESUBMITTED"
            : "WITHDRAWN",
      );
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });
router.post("/interventions/:id/start", async (req, res, next) => {
  try {
    const b = z.object({ organizationId: uuid }).parse(req.body);
    await service.startWork(
      req.user!.id,
      b.organizationId,
      uuid.parse(req.params.id),
    );
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
router.post("/interventions/:id/milestones", async (req, res, next) => {
  try {
    const b = z
      .object({
        organizationId: uuid,
        title: z.string().min(3).max(180),
        details: z.string().max(2000).optional(),
        dueDate: z.string().date().optional(),
      })
      .parse(req.body);
    res.status(201).json({
      data: await service.addMilestone(
        req.user!.id,
        b.organizationId,
        uuid.parse(req.params.id),
        b as Parameters<typeof service.addMilestone>[3],
      ),
    });
  } catch (e) {
    next(e);
  }
});
router.post("/interventions/:id/completion", async (req, res, next) => {
  try {
    const b = z
      .object({
        organizationId: uuid,
        statement: z.string().min(10).max(4000),
        payload: z.record(z.unknown()).default({}),
      })
      .parse(req.body);
    await service.completion(
      req.user!.id,
      b.organizationId,
      uuid.parse(req.params.id),
      b.statement,
      b.payload,
    );
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
export default router;
