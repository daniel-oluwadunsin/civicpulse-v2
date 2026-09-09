import { Router } from "express";
import { z } from "zod";
import { transaction, query } from "../../db/pool.js";
import { requireAuth } from "../../middleware/auth.js";
import {
  allowedMedia,
  signUpload,
  verifyAsset,
} from "../../providers/cloudinary.js";
import { AppError } from "../../utils/errors.js";
const router = Router();
const point = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().positive().max(100000).optional(),
  source: z.enum(["DEVICE", "MAP", "ADDRESS"]),
  confirmed: z.boolean(),
});
async function ownReport(id: string, userId: string) {
  const result = await query<{ id: string; status: string }>(
    "select id,status from reports where id=$1 and reporter_user_id=$2",
    [id, userId],
  );
  if (!result.rowCount)
    throw new AppError(404, "NOT_FOUND", "Report draft not found.");
  return result.rows[0]!;
}
router.post("/", requireAuth, async (req, res, next) => {
  try {
    const input = z
      .object({
        originalText: z.string().max(6000).optional(),
        typedLocation: z.string().max(500).optional(),
      })
      .parse(req.body);
    const result = await query<{ id: string }>(
      "insert into reports(reporter_user_id,original_text,typed_location) values($1,$2,$3) returning id",
      [req.user!.id, input.originalText ?? null, input.typedLocation ?? null],
    );
    res.status(201).json({ data: { id: result.rows[0]!.id, status: "DRAFT" } });
  } catch (error) {
    next(error);
  }
});
router.patch("/:reportId", requireAuth, async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.reportId);
    const report = await ownReport(id, req.user!.id);
    if (report.status !== "DRAFT")
      throw new AppError(
        409,
        "REPORT_ALREADY_SUBMITTED",
        "This report can no longer be edited.",
      );
    const input = z
      .object({
        originalText: z.string().max(6000).optional(),
        typedLocation: z.string().max(500).optional(),
        location: point.optional(),
      })
      .parse(req.body);
    await query(
      "update reports set original_text=coalesce($1,original_text),typed_location=coalesce($2,typed_location),location=case when $3::float is null then location else ST_SetSRID(ST_MakePoint($4,$3),4326) end,location_accuracy_meters=$5,location_source=$6,user_confirmed_location=coalesce($7,user_confirmed_location) where id=$8",
      [
        input.originalText ?? null,
        input.typedLocation ?? null,
        input.location?.latitude ?? null,
        input.location?.longitude ?? null,
        input.location?.accuracyMeters ?? null,
        input.location?.source ?? null,
        input.location?.confirmed ?? null,
        id,
      ],
    );
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});
router.post(
  "/:reportId/media/sign-upload",
  requireAuth,
  async (req, res, next) => {
    try {
      const reportId = z.string().uuid().parse(req.params.reportId);
      const report = await ownReport(reportId, req.user!.id);
      if (report.status !== "DRAFT")
        throw new AppError(
          409,
          "REPORT_ALREADY_SUBMITTED",
          "This report can no longer accept media.",
        );
      const input = z
        .object({
          kind: z.enum(["image", "audio", "video"]),
          mimeType: z.string(),
          bytes: z.number().int().positive().max(100_000_000),
        })
        .parse(req.body);
      if (!allowedMedia.get(input.kind)?.includes(input.mimeType))
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          "Unsupported evidence media type.",
        );
      res.json({ data: signUpload({ reportId, kind: input.kind }) });
    } catch (error) {
      next(error);
    }
  },
);
router.post("/:reportId/media/verify", requireAuth, async (req, res, next) => {
  try {
    const reportId = z.string().uuid().parse(req.params.reportId);
    await ownReport(reportId, req.user!.id);
    const input = z
      .object({
        publicId: z.string().min(1),
        resourceType: z.enum(["image", "video"]),
        mimeType: z.string(),
        kind: z.enum(["image", "audio", "video"]),
      })
      .parse(req.body);
    const asset = await verifyAsset(input.publicId, input.resourceType);
    const context = (asset.context?.custom?.report_id ??
      asset.context?.report_id) as string | undefined;
    if (context !== reportId)
      throw new AppError(
        400,
        "MEDIA_VERIFICATION_FAILED",
        "Uploaded asset does not belong to this report.",
      );
    if (asset.bytes > 100_000_000)
      throw new AppError(
        400,
        "MEDIA_VERIFICATION_FAILED",
        "The uploaded asset exceeds the evidence limit.",
      );
    await query(
      "insert into report_media(report_id,cloudinary_public_id,cloudinary_asset_id,resource_type,format,bytes,width,height,duration,mime_type) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict(cloudinary_public_id) do nothing",
      [
        reportId,
        input.publicId,
        asset.asset_id ?? null,
        input.resourceType,
        asset.format ?? null,
        asset.bytes ?? null,
        asset.width ?? null,
        asset.height ?? null,
        asset.duration ?? null,
        input.mimeType,
      ],
    );
    res.status(201).json({ data: { publicId: input.publicId } });
  } catch (error) {
    next(error);
  }
});
router.post("/:reportId/submit", requireAuth, async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.reportId);
    const report = await ownReport(id, req.user!.id);
    if (report.status !== "DRAFT")
      throw new AppError(
        409,
        "REPORT_ALREADY_SUBMITTED",
        "This report has already been submitted.",
      );
    const submitted = await transaction(async (client) => {
      const row = await client.query<{ id: string }>(
        "update reports set status='PROCESSING',submitted_at=now() where id=$1 and user_confirmed_location=true and location is not null returning id",
        [id],
      );
      if (!row.rowCount)
        throw new AppError(
          400,
          "LOCATION_REQUIRED",
          "Confirm a map location before submitting.",
        );
      await client.query(
        "select graphile_worker.add_job('process-report',$1::json,job_key=>$2,job_key_mode=>'replace')",
        [JSON.stringify({ reportId: id }), `process-report:${id}`],
      );
      return row.rows[0]!;
    });
    res.status(202).json({ data: { id: submitted.id, status: "PROCESSING" } });
  } catch (error) {
    next(error);
  }
});
router.get("/:reportId", requireAuth, async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.reportId);
    await ownReport(id, req.user!.id);
    const [report, media] = await Promise.all([
      query(
        "select id,original_text,status,typed_location,user_confirmed_location,location_accuracy_meters,location_source from reports where id=$1",
        [id],
      ),
      query(
        "select id,cloudinary_public_id,resource_type,format,bytes,visibility from report_media where report_id=$1",
        [id],
      ),
    ]);
    res.json({ data: { ...report.rows[0], media: media.rows } });
  } catch (error) {
    next(error);
  }
});
export default router;
