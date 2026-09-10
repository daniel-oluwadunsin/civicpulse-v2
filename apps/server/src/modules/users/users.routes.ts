import { Router } from "express";
import { z } from "zod";
import { query } from "../../db/pool.js";
import { requireAuth } from "../../middleware/auth.js";
import { decodeCursor, encodeCursor } from "../../utils/pagination.js";
import {
  allowedMedia,
  destroyAsset,
  signAvatarUpload,
  verifyAsset,
} from "../../providers/cloudinary.js";
import { AppError } from "../../utils/errors.js";
const router = Router();
router.use(requireAuth);
router.post("/me/avatar/sign-upload", async (req, res, next) => {
  try {
    const input = z
      .object({
        mimeType: z.string(),
        bytes: z.number().int().positive().max(5_000_000),
      })
      .parse(req.body);
    if (!allowedMedia.get("image")?.includes(input.mimeType))
      throw new AppError(
        400,
        "INVALID_MEDIA",
        "Choose a JPG, PNG, or WebP avatar smaller than 5 MB.",
      );
    res.json({
      data: signAvatarUpload({
        userId: req.user!.id,
        mimeType: input.mimeType,
        bytes: input.bytes,
      }),
    });
  } catch (error) {
    next(error);
  }
});
router.post("/me/avatar/verify", async (req, res, next) => {
  try {
    const input = z
      .object({ publicId: z.string().min(1), mimeType: z.string() })
      .parse(req.body);
    if (!allowedMedia.get("image")?.includes(input.mimeType))
      throw new AppError(400, "INVALID_MEDIA", "Unsupported avatar format.");
    const asset = await verifyAsset(input.publicId, "image");
    const context = asset.context?.custom ?? asset.context ?? {};
    const expectedFolder = `${process.env.CLOUDINARY_EVIDENCE_FOLDER ?? "civicpulse/evidence"}/avatar/${req.user!.id}/`;
    if (
      context.scope_id !== req.user!.id ||
      context.purpose !== "AVATAR" ||
      context.kind !== "image" ||
      context.mime_type !== input.mimeType ||
      asset.resource_type !== "image" ||
      !input.publicId.startsWith(expectedFolder) ||
      Number(asset.bytes) > 5_000_000
    )
      throw new AppError(
        400,
        "MEDIA_VERIFICATION_FAILED",
        "Uploaded avatar did not match its signed intent.",
      );
    const current = await query<{ avatar_public_id: string | null }>(
      "select avatar_public_id from users where id=$1",
      [req.user!.id],
    );
    await query(
      "update users set avatar_public_id=$1,updated_at=now() where id=$2",
      [input.publicId, req.user!.id],
    );
    if (
      current.rows[0]?.avatar_public_id &&
      current.rows[0].avatar_public_id !== input.publicId
    )
      await destroyAsset(current.rows[0].avatar_public_id, "image");
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});
router.delete("/me/avatar", async (req, res, next) => {
  try {
    const current = await query<{ avatar_public_id: string | null }>(
      "select avatar_public_id from users where id=$1",
      [req.user!.id],
    );
    const publicId = current.rows[0]?.avatar_public_id;
    await query(
      "update users set avatar_public_id=null,updated_at=now() where id=$1",
      [req.user!.id],
    );
    if (publicId) await destroyAsset(publicId, "image");
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});
router.get("/me/profile", async (req, res, next) => {
  try {
    const result = await query(
      "select id,email,display_name,avatar_public_id,theme_preference,notification_preferences,created_at from users where id=$1",
      [req.user!.id],
    );
    res.json({ data: result.rows[0] });
  } catch (e) {
    next(e);
  }
});
router.patch("/me/profile", async (req, res, next) => {
  try {
    const input = z
      .object({
        displayName: z.string().trim().min(2).max(80).optional(),
        themePreference: z.enum(["LIGHT", "DARK", "SYSTEM"]).optional(),
        avatarPublicId: z.string().max(500).nullable().optional(),
      })
      .parse(req.body);
    const result = await query(
      "update users set display_name=coalesce($1,display_name),theme_preference=coalesce($2,theme_preference),avatar_public_id=case when $3::boolean then $4 else avatar_public_id end,updated_at=now() where id=$5 returning id,email,display_name,avatar_public_id,theme_preference,notification_preferences",
      [
        input.displayName ?? null,
        input.themePreference ?? null,
        "avatarPublicId" in input,
        input.avatarPublicId ?? null,
        req.user!.id,
      ],
    );
    res.json({ data: result.rows[0] });
  } catch (e) {
    next(e);
  }
});
router.get("/me/activity", async (req, res, next) => {
  try {
    const limit = z.coerce
      .number()
      .int()
      .min(1)
      .max(50)
      .default(20)
      .parse(req.query.limit);
    const cursor = z.string().optional().parse(req.query.cursor);
    const values: unknown[] = [req.user!.id, limit + 1];
    let where = "user_id=$1";
    if (cursor) {
      const c = decodeCursor(cursor)!;
      values.push(c.at, c.id);
      where += " and (created_at,id)<($3::timestamptz,$4::uuid)";
    }
    const rows = await query<{
      id: string;
      type: string;
      payload: Record<string, unknown>;
      read_at: string | null;
      created_at: string;
    }>(
      `select id,type,payload,read_at,created_at from notifications where ${where} order by created_at desc,id desc limit $2`,
      values,
    );
    const hasMore = rows.rows.length > limit;
    const data = rows.rows.slice(0, limit);
    res.json({
      data,
      page: {
        nextCursor: hasMore
          ? encodeCursor({ at: data.at(-1)!.created_at, id: data.at(-1)!.id })
          : null,
      },
    });
  } catch (e) {
    next(e);
  }
});
router.put("/me/notification-preferences", async (req, res, next) => {
  try {
    const input = z
      .object({
        mentions: z.boolean(),
        incidentUpdates: z.boolean(),
        workflow: z.boolean(),
      })
      .parse(req.body);
    await query(
      "update users set notification_preferences=$1,updated_at=now() where id=$2",
      [JSON.stringify(input), req.user!.id],
    );
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
router.post("/me/activity/read-all", async (req, res, next) => {
  try {
    await query(
      "update notifications set read_at=coalesce(read_at,now()) where user_id=$1",
      [req.user!.id],
    );
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
router.patch("/me/activity/:id", async (req, res, next) => {
  try {
    await query(
      "update notifications set read_at=coalesce(read_at,now()) where id=$1 and user_id=$2",
      [z.string().uuid().parse(req.params.id), req.user!.id],
    );
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
export default router;
