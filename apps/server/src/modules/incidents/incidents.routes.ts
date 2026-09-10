import { Router } from "express";
import { z } from "zod";
import { optionalAuth, requireAuth } from "../../middleware/auth.js";
import { databaseRateLimit } from "../../middleware/database-rate-limit.js";
import {
  commentSchema,
  feedQuerySchema,
  reactionSchema,
} from "./incidents.schemas.js";
import * as service from "./incidents.service.js";
const router = Router();
const uuid = z.string().uuid();
router.get("/", optionalAuth, async (req, res, next) => {
  try {
    const result = await service.listIncidents(
      feedQuerySchema.parse(req.query),
      req.user?.id,
    );
    res.json(result);
  } catch (e) {
    next(e);
  }
});
router.get("/filter-options", async (_req, res, next) => {
  try {
    res.json({ data: await service.filterOptions() });
  } catch (error) {
    next(error);
  }
});
router.get("/map", optionalAuth, async (req, res, next) => {
  try {
    const result = await service.listIncidents(
      feedQuerySchema.parse({ ...req.query, limit: 50, cursor: undefined }),
      req.user?.id,
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});
router.get("/:incidentId", optionalAuth, async (req, res, next) => {
  try {
    res.json({
      data: await service.getPublicIncident(
        uuid.parse(req.params.incidentId),
        req.user?.id,
      ),
    });
  } catch (e) {
    next(e);
  }
});
router.get("/:incidentId/timeline", async (req, res, next) => {
  try {
    res.json(
      await service.listTimeline(
        uuid.parse(req.params.incidentId),
        z.string().optional().parse(req.query.cursor),
      ),
    );
  } catch (e) {
    next(e);
  }
});
router.get("/:incidentId/evidence", async (req, res, next) => {
  try {
    res.json({
      data: await service.listEvidence(uuid.parse(req.params.incidentId)),
    });
  } catch (e) {
    next(e);
  }
});
router.get("/:incidentId/comments", async (req, res, next) => {
  try {
    res.json({
      data: await service.listComments(uuid.parse(req.params.incidentId)),
    });
  } catch (e) {
    next(e);
  }
});
router.put(
  "/:incidentId/reaction",
  requireAuth,
  databaseRateLimit("reaction", 60),
  async (req, res, next) => {
    try {
      await service.setReaction(
        uuid.parse(req.params.incidentId),
        req.user!.id,
        reactionSchema.parse(req.body).reaction,
      );
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  },
);
router.delete("/:incidentId/reaction", requireAuth, async (req, res, next) => {
  try {
    await service.setReaction(
      uuid.parse(req.params.incidentId),
      req.user!.id,
      null,
    );
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
for (const [path, table] of [
  ["affected", "affected_confirmations"],
  ["confirmation", "incident_confirmations"],
  ["follow", "incident_follows"],
] as const) {
  router.put(
    `/:incidentId/${path}`,
    requireAuth,
    databaseRateLimit(path, 30),
    async (req, res, next) => {
      try {
        await service.toggleSimple(
          table,
          uuid.parse(req.params.incidentId),
          req.user!.id,
          true,
        );
        res.status(204).end();
      } catch (e) {
        next(e);
      }
    },
  );
  router.delete(`/:incidentId/${path}`, requireAuth, async (req, res, next) => {
    try {
      await service.toggleSimple(
        table,
        uuid.parse(req.params.incidentId),
        req.user!.id,
        false,
      );
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });
}
router.post(
  "/:incidentId/comments",
  requireAuth,
  databaseRateLimit("comment", 20),
  async (req, res, next) => {
    try {
      const input = commentSchema.parse(req.body);
      res.status(201).json({
        data: await service.createComment(
          uuid.parse(req.params.incidentId),
          req.user!.id,
          input.body,
          input.parentCommentId,
          input.organizationId,
          input.mentionedOrganizationIds,
        ),
      });
    } catch (e) {
      next(e);
    }
  },
);
router.patch(
  "/:incidentId/comments/:commentId",
  requireAuth,
  async (req, res, next) => {
    try {
      await service.editComment(
        uuid.parse(req.params.incidentId),
        uuid.parse(req.params.commentId),
        req.user!.id,
        commentSchema.pick({ body: true }).parse(req.body).body,
      );
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  },
);
router.delete(
  "/:incidentId/comments/:commentId",
  requireAuth,
  async (req, res, next) => {
    try {
      await service.deleteComment(
        uuid.parse(req.params.incidentId),
        uuid.parse(req.params.commentId),
        req.user!.id,
      );
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  },
);
router.put(
  "/:incidentId/resolution-verification",
  requireAuth,
  databaseRateLimit("resolution-verification", 10),
  async (req, res, next) => {
    try {
      const b = z
        .object({
          verdict: z.enum(["CONFIRM", "DISPUTE"]),
          note: z.string().trim().max(2000).optional(),
          evidenceId: z.string().uuid().optional(),
          latitude: z.number().min(-90).max(90).optional(),
          longitude: z.number().min(-180).max(180).optional(),
        })
        .parse(req.body);
      res.json({
        data: await service.verifyResolution(
          uuid.parse(req.params.incidentId),
          req.user!.id,
          b as Parameters<typeof service.verifyResolution>[2],
        ),
      });
    } catch (e) {
      next(e);
    }
  },
);
router.post(
  "/:incidentId/evidence-drafts",
  requireAuth,
  async (req, res, next) => {
    try {
      const incidentId = uuid.parse(req.params.incidentId);
      await service.getPublicIncident(incidentId, req.user!.id);
      const row = await import("../../db/pool.js").then(({ query }) =>
        query<{ id: string }>(
          "insert into reports(reporter_user_id,target_incident_id,original_text) values($1,$2,$3) returning id",
          [
            req.user!.id,
            incidentId,
            z
              .object({ originalText: z.string().max(6000).optional() })
              .parse(req.body).originalText ?? null,
          ],
        ),
      );
      res.status(201).json({ data: { id: row.rows[0]!.id, status: "DRAFT" } });
    } catch (e) {
      next(e);
    }
  },
);
export default router;
