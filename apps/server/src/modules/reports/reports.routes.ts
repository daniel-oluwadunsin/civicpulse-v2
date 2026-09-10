import { Router } from "express";
import { z } from "zod";
import { transaction, query } from "../../db/pool.js";
import { requireAuth } from "../../middleware/auth.js";
import { databaseRateLimit } from "../../middleware/database-rate-limit.js";
import {
  allowedMedia,
  destroyAsset,
  mediaLimits,
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
router.post(
  "/",
  requireAuth,
  databaseRateLimit("report-draft", 30, 3600),
  async (req, res, next) => {
    try {
      const input = z
        .object({
          originalText: z.string().max(6000).optional(),
          typedLocation: z.string().max(500).optional(),
          targetIncidentId: z.string().uuid().optional(),
          idempotencyKey: z.string().min(8).max(100).optional(),
        })
        .parse(req.body);
      const result = await query<{ id: string }>(
        "insert into reports(reporter_user_id,original_text,typed_location,target_incident_id,idempotency_key) values($1,$2,$3,$4,$5) on conflict(reporter_user_id,idempotency_key) where idempotency_key is not null do update set reporter_user_id=excluded.reporter_user_id returning id,status",
        [
          req.user!.id,
          input.originalText ?? null,
          input.typedLocation ?? null,
          input.targetIncidentId ?? null,
          input.idempotencyKey ?? null,
        ],
      );
      res
        .status(201)
        .json({ data: { id: result.rows[0]!.id, status: "DRAFT" } });
    } catch (error) {
      next(error);
    }
  },
);
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
  databaseRateLimit("media-upload", 30, 3600),
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
      if (input.bytes > mediaLimits[input.kind].bytes)
        throw new AppError(
          400,
          "MEDIA_TOO_LARGE",
          `This ${input.kind} exceeds the upload limit.`,
        );
      const current = await query<{ count: string }>(
        "select count(*)::text as count from report_media where report_id=$1 and media_kind=$2",
        [reportId, input.kind],
      );
      if (Number(current.rows[0]?.count ?? 0) >= mediaLimits[input.kind].count)
        throw new AppError(
          409,
          "MEDIA_COUNT_LIMIT",
          `This report already has the maximum number of ${input.kind} files.`,
        );
      res.json({
        data: signUpload({
          reportId,
          kind: input.kind,
          mimeType: input.mimeType,
          bytes: input.bytes,
        }),
      });
    } catch (error) {
      next(error);
    }
  },
);
router.post("/:reportId/media/verify", requireAuth, async (req, res, next) => {
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
        publicId: z.string().min(1),
        resourceType: z.enum(["image", "video"]),
        mimeType: z.string(),
        kind: z.enum(["image", "audio", "video"]),
      })
      .parse(req.body);
    const asset = await verifyAsset(input.publicId, input.resourceType);
    const context = (asset.context?.custom?.report_id ??
      asset.context?.report_id) as string | undefined;
    const assetContext = asset.context?.custom ?? asset.context ?? {};
    const expectedFolder = `${process.env.CLOUDINARY_EVIDENCE_FOLDER ?? "civicpulse/evidence"}/${reportId}/`;
    const allowedFormats = {
      image: ["jpg", "jpeg", "png", "webp"],
      audio: ["mp3", "mp4", "m4a", "wav", "webm"],
      video: ["mp4", "webm", "mov"],
    } as const;
    if (
      context !== reportId ||
      assetContext.kind !== input.kind ||
      assetContext.mime_type !== input.mimeType ||
      !input.publicId.startsWith(expectedFolder) ||
      asset.resource_type !== input.resourceType ||
      !asset.format ||
      !(allowedFormats[input.kind] as readonly string[]).includes(asset.format)
    )
      throw new AppError(
        400,
        "MEDIA_VERIFICATION_FAILED",
        "Uploaded asset does not belong to this report.",
      );
    if (asset.bytes > mediaLimits[input.kind].bytes)
      throw new AppError(
        400,
        "MEDIA_VERIFICATION_FAILED",
        "The uploaded asset exceeds the evidence limit.",
      );
    await transaction(async (client) => {
      await client.query("select pg_advisory_xact_lock(hashtext($1))", [
        reportId,
      ]);
      const editable = await client.query(
        "select 1 from reports where id=$1 and reporter_user_id=$2 and status='DRAFT' for update",
        [reportId, req.user!.id],
      );
      if (!editable.rowCount)
        throw new AppError(
          409,
          "REPORT_ALREADY_SUBMITTED",
          "This report can no longer accept media.",
        );
      const count = await client.query<{ count: string }>(
        "select count(*)::text count from report_media where report_id=$1 and media_kind=$2",
        [reportId, input.kind],
      );
      if (Number(count.rows[0]?.count ?? 0) >= mediaLimits[input.kind].count)
        throw new AppError(
          409,
          "MEDIA_COUNT_LIMIT",
          `This report already has the maximum number of ${input.kind} files.`,
        );
      await client.query(
        "insert into report_media(report_id,cloudinary_public_id,cloudinary_asset_id,resource_type,format,bytes,width,height,duration,mime_type,media_kind) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) on conflict(cloudinary_public_id) do nothing",
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
          input.kind,
        ],
      );
    });
    res.status(201).json({ data: { publicId: input.publicId } });
  } catch (error) {
    next(error);
  }
});
router.delete(
  "/:reportId/media/:mediaId",
  requireAuth,
  async (req, res, next) => {
    try {
      const reportId = z.string().uuid().parse(req.params.reportId);
      const mediaId = z.string().uuid().parse(req.params.mediaId);
      const report = await ownReport(reportId, req.user!.id);
      if (report.status !== "DRAFT")
        throw new AppError(
          409,
          "REPORT_ALREADY_SUBMITTED",
          "Submitted evidence is retained for audit.",
        );
      const media = await query<{
        cloudinary_public_id: string;
        resource_type: "image" | "video";
      }>(
        "select cloudinary_public_id,resource_type from report_media where id=$1 and report_id=$2",
        [mediaId, reportId],
      );
      if (!media.rowCount)
        throw new AppError(404, "NOT_FOUND", "Evidence file not found.");
      await destroyAsset(
        media.rows[0]!.cloudinary_public_id,
        media.rows[0]!.resource_type,
      );
      await query("delete from report_media where id=$1 and report_id=$2", [
        mediaId,
        reportId,
      ]);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  },
);
router.post(
  "/:reportId/submit",
  requireAuth,
  databaseRateLimit("report-submit", 10, 3600),
  async (req, res, next) => {
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
          "update reports set status='PROCESSING',processing_stage='QUEUED',submitted_at=now() where id=$1 and status='DRAFT' and user_confirmed_location=true and location is not null and (nullif(trim(original_text),'') is not null or exists(select 1 from report_media where report_id=$1)) returning id",
          [id],
        );
        if (!row.rowCount)
          throw new AppError(
            400,
            "LOCATION_REQUIRED",
            "A draft can be submitted once with confirmed location and text or evidence.",
          );
        await client.query(
          "select graphile_worker.add_job('process-report',$1::json,job_key=>$2,job_key_mode=>'replace')",
          [JSON.stringify({ reportId: id }), `process-report:${id}`],
        );
        return row.rows[0]!;
      });
      res
        .status(202)
        .json({ data: { id: submitted.id, status: "PROCESSING" } });
    } catch (error) {
      next(error);
    }
  },
);
router.get("/:reportId", requireAuth, async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.reportId);
    await ownReport(id, req.user!.id);
    const [report, media] = await Promise.all([
      query(
        "select id,original_text,status,typed_location,user_confirmed_location,location_accuracy_meters,location_source,ST_Y(location) latitude,ST_X(location) longitude from reports where id=$1",
        [id],
      ),
      query(
        "select id,cloudinary_public_id,resource_type,media_kind,format,bytes,visibility from report_media where report_id=$1 order by created_at",
        [id],
      ),
    ]);
    res.json({ data: { ...report.rows[0], media: media.rows } });
  } catch (error) {
    next(error);
  }
});
export default router;
