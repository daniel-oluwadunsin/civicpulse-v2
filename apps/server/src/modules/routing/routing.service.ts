import type { PoolClient } from "pg";
import { withGemini } from "../../providers/gemini.js";
import { env } from "../../config/env.js";
import { AppError } from "../../utils/errors.js";
export async function resolveJurisdictions(
  client: PoolClient,
  longitude: number,
  latitude: number,
) {
  const result = await client.query<{ id: string; type: string }>(
    "select id,type from jurisdictions where active=true and ST_Covers(boundary,ST_SetSRID(ST_MakePoint($1,$2),4326)) order by case type when 'LGA' then 1 when 'STATE' then 2 when 'COUNTRY' then 3 else 4 end",
    [longitude, latitude],
  );
  const lga = result.rows.find((row) => row.type === "LGA")?.id;
  const state = result.rows.find((row) => row.type === "STATE")?.id;
  if (!lga || !state)
    return { lgaId: lga, stateId: state, reviewRequired: true };
  return { lgaId: lga, stateId: state, reviewRequired: false };
}
export async function routeIncident(
  client: PoolClient,
  input: {
    incidentId: string;
    category: string;
    summary: string;
    lgaId?: string | undefined;
    stateId?: string | undefined;
  },
) {
  const candidates = await client.query<{
    id: string;
    official_name: string;
    government_level: string;
    mandate_text: string;
    responsibilities: unknown;
    exclusions: unknown;
    issue_categories: unknown;
    asset_types: unknown;
  }>(
    `select distinct o.id,o.official_name,g.government_level,g.mandate_text,g.responsibilities,g.exclusions,g.issue_categories,g.asset_types from organizations o join government_profiles g on g.organization_id=o.id left join organization_jurisdictions oj on oj.organization_id=o.id where o.kind='GOVERNMENT' and o.active=true and o.verification_status='VERIFIED' and (g.government_level='FEDERAL' or oj.jurisdiction_id=any($1::uuid[]))`,
    [[input.lgaId, input.stateId].filter(Boolean)],
  );
  if (!candidates.rowCount)
    return {
      reviewRequired: true,
      reason: "No verified eligible government organization is available.",
    };
  const candidateIds = candidates.rows.map((row) => row.id);
  const prompt = `Choose responsibility only from these candidates. Return concise JSON with primaryOrganizationId (or null), primaryConfidence (0-1), reason, supportingOrganizations [{organizationId,confidence,reason}], reviewRequired, missingInformation. Incident: ${JSON.stringify({ category: input.category, summary: input.summary })}. Candidates: ${JSON.stringify(candidates.rows)}`;
  const response = await withGemini(
    env.GEMINI_MODEL_ROUTING,
    async (clientApi, model) =>
      clientApi.models.generateContent({
        model,
        contents: prompt,
        config: { responseMimeType: "application/json" },
      }),
  );
  const parsed = JSON.parse(response.text ?? "{}");
  const selected = [
    parsed.primaryOrganizationId,
    ...(parsed.supportingOrganizations ?? []).map(
      (x: { organizationId: string }) => x.organizationId,
    ),
  ].filter(Boolean);
  if (selected.some((id: string) => !candidateIds.includes(id)))
    throw new AppError(
      502,
      "AI_INVALID_RESPONSE",
      "Gemini returned an organization outside the supplied candidate set.",
    );
  await client.query(
    "insert into routing_decisions(incident_id,candidate_organization_ids,selected_organization_ids,rationale,primary_confidence,missing_information,review_required,model_name) values($1,$2,$3,$4,$5,$6,$7,$8)",
    [
      input.incidentId,
      JSON.stringify(candidateIds),
      JSON.stringify(selected),
      parsed.reason ?? "No rationale supplied.",
      parsed.primaryConfidence ?? null,
      JSON.stringify(parsed.missingInformation ?? []),
      Boolean(parsed.reviewRequired),
      env.GEMINI_MODEL_ROUTING ?? null,
    ],
  );
  for (const id of selected) {
    const support = (parsed.supportingOrganizations ?? []).find(
      (x: { organizationId: string }) => x.organizationId === id,
    );
    await client.query(
      "insert into incident_assignments(incident_id,organization_id,role,routing_confidence,routing_reason,routing_method) values($1,$2,$3,$4,$5,'AI') on conflict(incident_id,organization_id) do nothing",
      [
        input.incidentId,
        id,
        id === parsed.primaryOrganizationId ? "PRIMARY" : "SUPPORTING",
        id === parsed.primaryOrganizationId
          ? parsed.primaryConfidence
          : support?.confidence,
        id === parsed.primaryOrganizationId ? parsed.reason : support?.reason,
      ],
    );
  }
  return parsed;
}
