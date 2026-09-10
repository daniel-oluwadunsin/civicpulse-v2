import { issueCategories } from "@civicpulse/shared";
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { query } from "../../db/pool.js";
const router = Router();
router.use(requireAuth);
const config = {
  areas: {
    table: "followed_areas",
    column: "jurisdiction_id",
    schema: z.string().uuid(),
  },
  categories: {
    table: "followed_categories",
    column: "category",
    schema: z.enum(issueCategories),
  },
  organizations: {
    table: "followed_organizations",
    column: "organization_id",
    schema: z.string().uuid(),
  },
} as const;
for (const [path, item] of Object.entries(config)) {
  router.put(`/${path}/:id`, async (req, res, next) => {
    try {
      const id = item.schema.parse(req.params.id);
      await query(
        `insert into ${item.table}(user_id,${item.column}) values($1,$2) on conflict do nothing`,
        [req.user!.id, id],
      );
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });
  router.delete(`/${path}/:id`, async (req, res, next) => {
    try {
      const id = item.schema.parse(req.params.id);
      await query(
        `delete from ${item.table} where user_id=$1 and ${item.column}=$2`,
        [req.user!.id, id],
      );
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });
}
export default router;
