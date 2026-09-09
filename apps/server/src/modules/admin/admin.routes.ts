import { Router } from "express";
import { z } from "zod";
import { transaction, query } from "../../db/pool.js";
import { requireAuth, requirePlatformRole } from "../../middleware/auth.js";
import { AppError } from "../../utils/errors.js";

const router = Router();
router.use(requireAuth, requirePlatformRole("CIVICPULSE_ADMIN"));

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
          "delete from incident_assignments where incident_id=$1",
          [incidentId],
        );
        if (input.primaryOrganizationId)
          await client.query(
            "insert into incident_assignments(incident_id,organization_id,role,routing_reason,routing_method,reviewed_by,reviewed_at) values($1,$2,'PRIMARY',$3,'MANUAL',$4,now())",
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
              "insert into incident_assignments(incident_id,organization_id,role,routing_reason,routing_method,reviewed_by,reviewed_at) values($1,$2,'SUPPORTING',$3,'MANUAL',$4,now())",
              [incidentId, id, input.reason, req.user!.id],
            );
        await client.query(
          "insert into audit_logs(actor_user_id,action,target_type,target_id,metadata,request_id) values($1,'ROUTING_OVERRIDE','incident',$2,$3,$4)",
          [req.user!.id, incidentId, JSON.stringify(input), req.requestId],
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
        "update incidents set official_status='CLOSED',public_visibility='REDIRECTED' where id=$1",
        [source],
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

export default router;
