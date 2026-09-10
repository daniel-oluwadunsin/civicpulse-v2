import type { Part } from "@google/genai";
import type { Task } from "graphile-worker";
import { pool, transaction } from "../../db/pool.js";
import { env } from "../../config/env.js";
import { withGemini } from "../../providers/gemini.js";
import { authenticatedAssetUrl } from "../../providers/cloudinary.js";
import { reportAnalysisSchema } from "../../modules/reports/reports.schemas.js";
import {
  resolveJurisdictions,
  routeIncident,
} from "../../modules/routing/routing.service.js";
import { AppError } from "../../utils/errors.js";
import { z } from "zod";

const analysisInstruction = `Analyze this civic report. Return one JSON object only with exactly these keys: hasCivicIssue (boolean), detectedLanguage (string), languageConfidence (0..1), originalTranscript (string or null), englishTranscript (string or null), title (string), summary (string), fullDescription (string), category, subcategory (string or null), affectedAssets (array of strings), observations (array of strings), urgencySignals (array of strings), locationMentions (array of strings). category MUST be exactly one of ROADS, DRAINAGE, WATER, WASTE, POWER, EDUCATION, HEALTH, PUBLIC_BUILDING, OTHER. Every list field MUST be a JSON array; use [] when there are no items. Separate observed facts from inference. Recognize English, Yoruba, Hausa, Igbo, and Nigerian Pidgin; use OTHER or UNKNOWN when appropriate. Do not invent evidence.`;
const matchingInstruction = (
  candidates: Array<{
    id: string;
    title: string;
    summary: string | null;
    distance: number;
  }>,
  analysis: { title: string; summary: string; category: string },
) =>
  `Return JSON only: {"decision":"MATCH"|"NEW"|"REVIEW_REQUIRED","incidentId":string|null,"confidence":number,"rationale":string}. Assess this report against ONLY these candidates; for MATCH incidentId must be one of their IDs. Report: ${JSON.stringify(analysis)}. Candidates: ${JSON.stringify(candidates)}`;
const matchDecisionSchema = z.object({
  decision: z.enum(["MATCH", "NEW", "REVIEW_REQUIRED"]),
  incidentId: z.string().uuid().nullable(),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1).max(2000),
});

async function analyzeReport(reportId: string, originalText: string | null) {
  const media = await pool.query<{
    cloudinary_public_id: string;
    resource_type: "image" | "video";
    format: string | null;
    mime_type: string;
    bytes: number;
  }>(
    "select cloudinary_public_id,resource_type,format,mime_type,bytes from report_media where report_id=$1 order by created_at",
    [reportId],
  );
  return withGemini(env.GEMINI_MODEL_REPORT_ANALYSIS, async (client, model) => {
    const parts: Part[] = [];
    const uploadedNames: string[] = [];
    try {
      for (const item of media.rows) {
        const response = await fetch(
          authenticatedAssetUrl(
            item.cloudinary_public_id,
            item.resource_type,
            item.format,
          ),
        );
        if (!response.ok)
          throw new Error(
            `Could not obtain verified evidence (${response.status}).`,
          );
        const blob = new Blob([await response.arrayBuffer()], {
          type: item.mime_type,
        });
        const uploaded = await client.files.upload({
          file: blob,
          config: {
            mimeType: item.mime_type,
            displayName: item.cloudinary_public_id,
          },
        });
        if (!uploaded.uri || !uploaded.mimeType || !uploaded.name)
          throw new Error(
            "Gemini did not return a usable uploaded evidence reference.",
          );
        uploadedNames.push(uploaded.name);
        parts.push({
          fileData: { fileUri: uploaded.uri, mimeType: uploaded.mimeType },
        });
      }
      const response = await client.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `${analysisInstruction}\nTyped report: ${originalText ?? "(no typed text)"}`,
              },
              ...parts,
            ],
          },
        ],
        config: { responseMimeType: "application/json" },
      });
      return reportAnalysisSchema.parse(JSON.parse(response.text ?? "{}"));
    } finally {
      await Promise.allSettled(
        uploadedNames.map((name) => client.files.delete({ name })),
      );
    }
  });
}

export const processReport: Task = async (payload, helpers) => {
  const reportId = (payload as { reportId?: string }).reportId;
  if (!reportId) throw new Error("reportId is required");
  const report = (
    await pool.query<{
      id: string;
      original_text: string | null;
      target_incident_id: string | null;
      longitude: number;
      latitude: number;
    }>(
      "select id,original_text,target_incident_id,ST_X(location) longitude,ST_Y(location) latitude from reports where id=$1 and status='PROCESSING'",
      [reportId],
    )
  ).rows[0];
  if (!report) return;
  try {
    await pool.query(
      "update reports set processing_stage='ANALYZING',processing_attempts=processing_attempts+1,failure_code=null,failure_message=null where id=$1",
      [reportId],
    );
    const analysis = await analyzeReport(reportId, report.original_text);
    await transaction(async (client) => {
      await client.query(
        "insert into report_analysis(report_id,detected_language,language_confidence,original_transcript,english_transcript,title,summary,full_description,has_civic_issue,category,subcategory,affected_assets,observations,urgency_signals,location_mentions,model_name,analysis_version) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'v1') on conflict(report_id) do update set detected_language=excluded.detected_language,language_confidence=excluded.language_confidence,original_transcript=excluded.original_transcript,english_transcript=excluded.english_transcript,title=excluded.title,summary=excluded.summary,full_description=excluded.full_description,has_civic_issue=excluded.has_civic_issue,category=excluded.category,subcategory=excluded.subcategory,affected_assets=excluded.affected_assets,observations=excluded.observations,urgency_signals=excluded.urgency_signals,location_mentions=excluded.location_mentions,model_name=excluded.model_name,analysis_version=excluded.analysis_version,created_at=now()",
        [
          reportId,
          analysis.detectedLanguage,
          analysis.languageConfidence ?? null,
          analysis.originalTranscript ?? null,
          analysis.englishTranscript ?? null,
          analysis.title,
          analysis.summary,
          analysis.fullDescription,
          analysis.hasCivicIssue,
          analysis.category,
          analysis.subcategory ?? null,
          JSON.stringify(analysis.affectedAssets),
          JSON.stringify(analysis.observations),
          JSON.stringify(analysis.urgencySignals),
          JSON.stringify(analysis.locationMentions),
          env.GEMINI_MODEL_REPORT_ANALYSIS ?? null,
        ],
      );
      if (!analysis.hasCivicIssue) {
        await client.query(
          "update reports set status='NEEDS_REVIEW',processing_stage='NON_CIVIC_REVIEW',processed_at=now() where id=$1",
          [reportId],
        );
        return;
      }
      const jurisdiction = await resolveJurisdictions(
        client,
        report.longitude,
        report.latitude,
      );
      const radiusByCategory: Record<string, number> = {
        ROADS: 150,
        DRAINAGE: 200,
        WATER: 250,
        WASTE: 250,
        POWER: 300,
        EDUCATION: 500,
        HEALTH: 500,
        PUBLIC_BUILDING: 500,
        OTHER: 150,
      };
      const matchRadius = radiusByCategory[analysis.category] ?? 150;
      if (report.target_incident_id) {
        const target = await client.query<{
          category: string;
          official_status: string;
          distance: number;
        }>(
          "select category,official_status,ST_Distance(location::geography,ST_SetSRID(ST_MakePoint($2,$3),4326)::geography) distance from incidents where id=$1 and public_visibility='PUBLIC'",
          [report.target_incident_id, report.longitude, report.latitude],
        );
        const selectedTarget = target.rows[0];
        if (
          !selectedTarget ||
          ["RESOLVED", "CLOSED", "REJECTED_INVALID"].includes(
            selectedTarget.official_status,
          ) ||
          selectedTarget.category !== analysis.category ||
          Number(selectedTarget.distance) > matchRadius
        ) {
          await client.query(
            "insert into incident_match_reviews(report_id,candidate_incident_ids,rationale,confidence) values($1,$2,$3,0) on conflict(report_id) do update set candidate_incident_ids=excluded.candidate_incident_ids,rationale=excluded.rationale,confidence=0,status='OPEN',resolved_at=null",
            [
              reportId,
              JSON.stringify(selectedTarget ? [report.target_incident_id] : []),
              selectedTarget &&
              ["RESOLVED", "CLOSED"].includes(selectedTarget.official_status)
                ? "Citizen evidence targets a resolved incident and requires related-incident review."
                : "Citizen-selected incident relationship failed deterministic category or distance validation.",
            ],
          );
          await client.query(
            "update reports set status='NEEDS_REVIEW',processing_stage='MATCH_REVIEW',processed_at=now() where id=$1",
            [reportId],
          );
          return;
        }
      }
      const candidates = await client.query<{
        id: string;
        title: string;
        summary: string | null;
        distance: number;
      }>(
        "select id,title,summary,ST_Distance(location::geography,ST_SetSRID(ST_MakePoint($1,$2),4326)::geography) distance from incidents where official_status not in ('RESOLVED','CLOSED','REJECTED_INVALID') and category=$3 and last_reported_at>now()-interval '180 days' and ST_DWithin(location::geography,ST_SetSRID(ST_MakePoint($1,$2),4326)::geography,$4) order by case when id=$5 then 0 else 1 end,distance limit 10",
        [
          report.longitude,
          report.latitude,
          analysis.category,
          matchRadius,
          report.target_incident_id,
        ],
      );
      let decision: {
        decision: "MATCH" | "NEW" | "REVIEW_REQUIRED";
        incidentId: string | null;
        confidence: number;
        rationale: string;
      } = {
        decision: "NEW",
        incidentId: null,
        confidence: 1,
        rationale: "No compatible nearby incidents were found.",
      };
      if (candidates.rowCount) {
        const match = await withGemini(
          env.GEMINI_MODEL_MATCHING,
          (gemini, model) =>
            gemini.models.generateContent({
              model,
              contents: matchingInstruction(candidates.rows, analysis),
              config: { responseMimeType: "application/json" },
            }),
        );
        const parsed = matchDecisionSchema.parse(
          JSON.parse(match.text ?? "{}"),
        );
        if (
          !["MATCH", "NEW", "REVIEW_REQUIRED"].includes(parsed.decision) ||
          (parsed.decision === "MATCH" &&
            !candidates.rows.some(
              (candidate) => candidate.id === parsed.incidentId,
            ))
        )
          throw new Error(
            "Gemini returned an invalid incident-matching decision.",
          );
        const confidenceDecision =
          parsed.decision === "MATCH" && parsed.confidence < 0.85
            ? "REVIEW_REQUIRED"
            : parsed.decision === "NEW" && parsed.confidence < 0.8
              ? "REVIEW_REQUIRED"
              : parsed.decision;
        decision = {
          decision: confidenceDecision,
          incidentId: parsed.incidentId ?? null,
          confidence: Number(parsed.confidence) || 0,
          rationale: String(parsed.rationale ?? ""),
        };
      }
      if (
        jurisdiction.reviewRequired ||
        decision.decision === "REVIEW_REQUIRED"
      ) {
        await client.query(
          "insert into incident_match_reviews(report_id,candidate_incident_ids,rationale,confidence) values($1,$2,$3,$4) on conflict(report_id) do update set candidate_incident_ids=excluded.candidate_incident_ids,rationale=excluded.rationale,confidence=excluded.confidence,status='OPEN',resolved_at=null",
          [
            reportId,
            JSON.stringify(candidates.rows.map((item) => item.id)),
            jurisdiction.reviewRequired
              ? "Jurisdiction could not be resolved uniquely."
              : decision.rationale,
            decision.confidence,
          ],
        );
        await client.query(
          "update reports set status='NEEDS_REVIEW',processing_stage='MATCH_REVIEW',processed_at=now() where id=$1",
          [reportId],
        );
        return;
      }
      let incidentId = decision.incidentId;
      let createdNewIncident = false;
      if (decision.decision === "MATCH" && incidentId) {
        await client.query(
          "insert into incident_reports(incident_id,report_id,matching_method,matching_confidence) values($1,$2,'AI_MATCH',$3)",
          [incidentId, reportId, decision.confidence],
        );
        await client.query(
          "update incidents set report_count=report_count+1,last_reported_at=now(),updated_at=now() where id=$1",
          [incidentId],
        );
      } else {
        createdNewIncident = true;
        const created = await client.query<{ id: string }>(
          "insert into incidents(public_reference,title,summary,category,subcategory,location,lga_jurisdiction_id,state_jurisdiction_id,report_count) values('CP-'||to_char(now(),'YYYY')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),$1,$2,$3,$4,ST_SetSRID(ST_MakePoint($5,$6),4326),$7,$8,1) returning id",
          [
            analysis.title,
            analysis.summary,
            analysis.category,
            analysis.subcategory ?? null,
            report.longitude,
            report.latitude,
            jurisdiction.lgaId ?? null,
            jurisdiction.stateId ?? null,
          ],
        );
        incidentId = created.rows[0]!.id;
        await client.query(
          "insert into incident_reports(incident_id,report_id,matching_method,matching_confidence) values($1,$2,$3,$4)",
          [incidentId, reportId, decision.decision, decision.confidence],
        );
      }
      if (createdNewIncident) {
        const routing = await routeIncident(client, {
          incidentId,
          category: analysis.category,
          summary: analysis.summary,
          lgaId: jurisdiction.lgaId,
          stateId: jurisdiction.stateId,
        });
        if (routing.reviewRequired) {
          await client.query(
            "update incidents set public_visibility=case when report_count=1 then 'PRIVATE_REVIEW' else public_visibility end where id=$1",
            [incidentId],
          );
          await client.query(
            "update reports set status='NEEDS_REVIEW',processing_stage='ROUTING_REVIEW',processed_at=now() where id=$1",
            [reportId],
          );
          return;
        }
      }
      await client.query(
        `insert into incident_evidence(incident_id,uploader_user_id,kind,report_media_id,resource_type,format,mime_type,visibility,moderation_status)
         select $1,r.reporter_user_id,'CITIZEN',m.id,m.resource_type,m.format,m.mime_type,'RESTRICTED','PENDING'
         from report_media m join reports r on r.id=m.report_id where m.report_id=$2
         and not exists(select 1 from incident_evidence e where e.report_media_id=m.id)`,
        [incidentId, reportId],
      );
      await client.query(
        "insert into incident_timeline_events(incident_id,event_type,actor_user_id,source_type,source_id,title,body,visibility,metadata) select $1,'CITIZEN_REPORT',reporter_user_id,'REPORT',id,'Citizen evidence added',null,'PUBLIC',$3::jsonb from reports where id=$2",
        [
          incidentId,
          reportId,
          JSON.stringify({
            relationship: createdNewIncident ? "CREATED" : "MATCHED",
          }),
        ],
      );
      await client.query(
        "insert into notifications(user_id,type,payload) select user_id,'INCIDENT_EVIDENCE_ADDED',$2::jsonb from incident_follows where incident_id=$1 and user_id<>(select reporter_user_id from reports where id=$3)",
        [incidentId, JSON.stringify({ incidentId, reportId }), reportId],
      );
      await client.query(
        "update reports set status='PROCESSED',processing_stage='COMPLETE',processed_at=now() where id=$1",
        [reportId],
      );
    });
  } catch (error) {
    const terminal = helpers.job.attempts >= helpers.job.max_attempts - 1;
    await pool.query(
      "update reports set status=case when $2 then 'FAILED' else 'PROCESSING' end,processing_stage=case when $2 then 'FAILED' else 'RETRY_PENDING' end,failure_code=$3,failure_message=$4 where id=$1 and status='PROCESSING'",
      [
        reportId,
        terminal,
        error instanceof AppError ? error.code : "PROCESSING_FAILED",
        error instanceof Error
          ? error.message.slice(0, 500)
          : "Unknown processing failure",
      ],
    );
    throw error;
  }
};
