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

async function evidenceParts(reportId: string) {
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
  if (!media.rowCount) return [] as Part[];
  return withGemini(env.GEMINI_MODEL_REPORT_ANALYSIS, async (client) => {
    const parts: Part[] = [];
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
      if (!uploaded.uri || !uploaded.mimeType)
        throw new Error(
          "Gemini did not return a usable uploaded evidence reference.",
        );
      parts.push({
        fileData: { fileUri: uploaded.uri, mimeType: uploaded.mimeType },
      });
    }
    return parts;
  });
}

export const processReport: Task = async (payload) => {
  const reportId = (payload as { reportId?: string }).reportId;
  if (!reportId) throw new Error("reportId is required");
  const report = (
    await pool.query<{
      id: string;
      original_text: string | null;
      longitude: number;
      latitude: number;
    }>(
      "select id,original_text,ST_X(location) longitude,ST_Y(location) latitude from reports where id=$1 and status='PROCESSING'",
      [reportId],
    )
  ).rows[0];
  if (!report) return;
  try {
    const media = await evidenceParts(reportId);
    const response = await withGemini(
      env.GEMINI_MODEL_REPORT_ANALYSIS,
      (client, model) =>
        client.models.generateContent({
          model,
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `${analysisInstruction}\nTyped report: ${report.original_text ?? "(no typed text)"}`,
                },
                ...media,
              ],
            },
          ],
          config: { responseMimeType: "application/json" },
        }),
    );
    const analysis = reportAnalysisSchema.parse(
      JSON.parse(response.text ?? "{}"),
    );
    await transaction(async (client) => {
      await client.query(
        "insert into report_analysis(report_id,detected_language,language_confidence,original_transcript,english_transcript,title,summary,full_description,has_civic_issue,category,subcategory,affected_assets,observations,urgency_signals,location_mentions,model_name,analysis_version) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'v1') on conflict(report_id) do update set detected_language=excluded.detected_language,title=excluded.title,summary=excluded.summary,full_description=excluded.full_description,category=excluded.category,observations=excluded.observations",
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
      const jurisdiction = await resolveJurisdictions(
        client,
        report.longitude,
        report.latitude,
      );
      const candidates = await client.query<{
        id: string;
        title: string;
        summary: string | null;
        distance: number;
      }>(
        "select id,title,summary,ST_Distance(location::geography,ST_SetSRID(ST_MakePoint($1,$2),4326)::geography) distance from incidents where official_status not in ('CLOSED','REJECTED_INVALID') and category=$3 and ST_DWithin(location::geography,ST_SetSRID(ST_MakePoint($1,$2),4326)::geography,150) order by distance limit 10",
        [report.longitude, report.latitude, analysis.category],
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
        const parsed = JSON.parse(match.text ?? "{}");
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
        decision = {
          decision: parsed.decision,
          incidentId: parsed.incidentId ?? null,
          confidence: Number(parsed.confidence) || 0,
          rationale: String(parsed.rationale ?? ""),
        };
      }
      let incidentId = decision.incidentId;
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
      if (
        jurisdiction.reviewRequired ||
        decision.decision === "REVIEW_REQUIRED"
      )
        await client.query(
          "update reports set status='NEEDS_REVIEW',processed_at=now() where id=$1",
          [reportId],
        );
      else {
        await routeIncident(client, {
          incidentId,
          category: analysis.category,
          summary: analysis.summary,
          lgaId: jurisdiction.lgaId,
          stateId: jurisdiction.stateId,
        });
        await client.query(
          "update reports set status='PROCESSED',processed_at=now() where id=$1",
          [reportId],
        );
      }
    });
  } catch (error) {
    await pool.query(
      "update reports set status='FAILED' where id=$1 and status='PROCESSING'",
      [reportId],
    );
    throw error;
  }
};
