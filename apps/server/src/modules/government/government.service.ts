import {
  canTransitionIncident,
  incidentStatuses,
  type IncidentStatus,
} from "@civicpulse/shared";
import { transaction, query } from "../../db/pool.js";
import {
  requireAssignedGovernment,
  requireMembership,
} from "../authorization.js";
import { AppError } from "../../utils/errors.js";
import { authenticatedAssetUrl } from "../../providers/cloudinary.js";

const managers = ["MANAGER", "ORG_ADMIN"] as const;
const officers = ["OFFICER", "MANAGER", "ORG_ADMIN"] as const;
export async function overview(userId: string, organizationId: string) {
  await requireMembership(userId, organizationId, "GOVERNMENT", [...officers]);
  const result = await query<{
    assigned: number;
    new_assignments: number;
    evidence_pending: number;
    routing_reviews: number;
    disputed_resolutions: number;
    proposals_pending: number;
  }>(
    `select
      (select count(*)::int from incident_assignments where organization_id=$1 and status='ACTIVE') assigned,
      (select count(*)::int from incident_assignments ia join incidents i on i.id=ia.incident_id where ia.organization_id=$1 and ia.status='ACTIVE' and ia.assigned_at>now()-interval '7 days') new_assignments,
      (select count(*)::int from incident_evidence e join incident_assignments ia on ia.incident_id=e.incident_id where ia.organization_id=$1 and ia.status='ACTIVE' and e.moderation_status='PENDING') evidence_pending,
      (select count(*)::int from routing_review_requests where organization_id=$1 and status='OPEN') routing_reviews,
      (select count(*)::int from incidents i join incident_assignments ia on ia.incident_id=i.id where ia.organization_id=$1 and ia.status='ACTIVE' and i.community_verification_status in ('COMMUNITY_DISPUTED','REVIEW_REQUIRED')) disputed_resolutions,
      (select count(*)::int from intervention_proposals p join incident_assignments ia on ia.incident_id=p.incident_id where ia.organization_id=$1 and ia.status='ACTIVE' and p.status in ('SUBMITTED','UNDER_REVIEW','CHANGES_REQUESTED','RESUBMITTED')) proposals_pending`,
    [organizationId],
  );
  const row = result.rows[0]!;
  return {
    assignedIncidents: row.assigned,
    newAssignments: row.new_assignments,
    evidencePending: row.evidence_pending,
    routingReviews: row.routing_reviews,
    disputedResolutions: row.disputed_resolutions,
    proposalsPending: row.proposals_pending,
  };
}
export async function listApprovalRequests(
  userId: string,
  organizationId: string,
) {
  await requireMembership(userId, organizationId, "GOVERNMENT", [...managers]);
  return (
    await query(
      `select a.id,a.proposal_id,a.approval_type,a.reason,a.required_documents,a.status,a.expires_at,p.incident_id,i.public_reference,i.title incident_title,coalesce(n.display_name,n.official_name) ngo_name
       from intervention_approvals a join intervention_proposals p on p.id=a.proposal_id join incidents i on i.id=p.incident_id join organizations n on n.id=p.lead_organization_id
       where a.authority_organization_id=$1 order by case when a.status='REQUIRED' then 0 else 1 end,i.updated_at desc`,
      [organizationId],
    )
  ).rows;
}
export async function listCoordinationRequests(
  userId: string,
  organizationId: string,
) {
  await requireMembership(userId, organizationId, "GOVERNMENT", [...managers]);
  return (
    await query(
      `select c.id,c.incident_id,c.reason,c.status,c.created_at,i.public_reference,i.title,coalesce(o.display_name,o.official_name) requesting_organization_name
       from incident_coordination_requests c join incidents i on i.id=c.incident_id join organizations o on o.id=c.requesting_organization_id
       where c.invited_organization_id=$1 order by case when c.status='PENDING' then 0 else 1 end,c.created_at desc`,
      [organizationId],
    )
  ).rows;
}
export async function listAssigned(
  userId: string,
  organizationId: string,
  filters: { status?: string | undefined; category?: string | undefined },
) {
  await requireMembership(userId, organizationId, "GOVERNMENT", [...officers]);
  const values: unknown[] = [organizationId];
  const where = ["ia.organization_id=$1", "ia.status='ACTIVE'"];
  if (filters.status) {
    values.push(filters.status);
    where.push(`i.official_status=$${values.length}`);
  }
  if (filters.category) {
    values.push(filters.category);
    where.push(`i.category=$${values.length}`);
  }
  return (
    await query(
      `select i.id,i.public_reference,i.title,i.category,i.official_status,i.community_verification_status,i.report_count,i.severity,i.updated_at,ia.role,ST_Y(i.location) latitude,ST_X(i.location) longitude from incident_assignments ia join incidents i on i.id=ia.incident_id where ${where.join(" and ")} order by i.updated_at desc`,
      values,
    )
  ).rows;
}
export async function detail(
  userId: string,
  organizationId: string,
  incidentId: string,
) {
  await requireAssignedGovernment(userId, organizationId, incidentId, [
    ...officers,
  ]);
  const [
    incident,
    reports,
    routing,
    updates,
    evidence,
    assignments,
    history,
    interventions,
  ] = await Promise.all([
    query(
      `select i.*,ST_Y(i.location) latitude,ST_X(i.location) longitude from incidents i where id=$1`,
      [incidentId],
    ),
    query(
      `select r.id,r.status,r.submitted_at,ra.title,ra.summary,ra.observations,ra.urgency_signals from incident_reports ir join reports r on r.id=ir.report_id left join report_analysis ra on ra.report_id=r.id where ir.incident_id=$1 order by r.submitted_at`,
      [incidentId],
    ),
    query(
      `select * from routing_decisions where incident_id=$1 order by created_at desc`,
      [incidentId],
    ),
    query(
      `select * from incident_updates where incident_id=$1 order by created_at desc`,
      [incidentId],
    ),
    query(
      `select e.id,e.kind,e.description,e.visibility,e.moderation_status,e.created_at,coalesce(e.mime_type,m.mime_type) mime_type from incident_evidence e left join report_media m on m.id=e.report_media_id where e.incident_id=$1 order by e.created_at desc`,
      [incidentId],
    ),
    query(
      `select ia.id,ia.role,ia.status,ia.routing_reason,ia.routing_confidence,ia.assigned_at,ia.ended_at,o.id organization_id,coalesce(o.display_name,o.official_name) organization_name from incident_assignments ia join organizations o on o.id=ia.organization_id where ia.incident_id=$1 order by ia.assigned_at`,
      [incidentId],
    ),
    query(
      `select id,from_status,to_status,organization_id,reason,created_at from incident_status_history where incident_id=$1 order by created_at desc`,
      [incidentId],
    ),
    query(
      `select p.id,p.status,p.intervention_types,p.physical_work,p.version,p.updated_at,coalesce(o.display_name,o.official_name) organization_name from intervention_proposals p join organizations o on o.id=p.lead_organization_id where p.incident_id=$1 order by p.updated_at desc`,
      [incidentId],
    ),
  ]);
  if (!incident.rows[0])
    throw new AppError(404, "NOT_FOUND", "Incident not found.");
  return {
    ...incident.rows[0],
    reports: reports.rows,
    routingDecisions: routing.rows,
    updates: updates.rows,
    evidence: evidence.rows,
    assignments: assignments.rows,
    statusHistory: history.rows,
    interventions: interventions.rows,
  };
}
export async function evidenceDelivery(
  userId: string,
  organizationId: string,
  evidenceId: string,
) {
  const evidence = await query<{
    incident_id: string;
    public_id: string | null;
    resource_type: "image" | "video" | null;
    format: string | null;
  }>(
    `select e.incident_id,coalesce(e.cloudinary_public_id,m.cloudinary_public_id) public_id,coalesce(e.resource_type,m.resource_type) resource_type,coalesce(e.format,m.format) format
     from incident_evidence e left join report_media m on m.id=e.report_media_id where e.id=$1`,
    [evidenceId],
  );
  const item = evidence.rows[0];
  if (!item?.public_id || !item.resource_type)
    throw new AppError(404, "NOT_FOUND", "Evidence item was not found.");
  await requireAssignedGovernment(userId, organizationId, item.incident_id, [
    ...officers,
  ]);
  return {
    url: authenticatedAssetUrl(item.public_id, item.resource_type, item.format),
  };
}
async function timeline(
  db: Parameters<Parameters<typeof transaction>[0]>[0],
  incidentId: string,
  input: {
    eventType: string;
    userId: string;
    organizationId: string;
    title: string;
    body?: string;
    visibility?: "PUBLIC" | "INTERNAL";
    sourceType: string;
    sourceId?: string;
  },
) {
  await db.query(
    "insert into incident_timeline_events(incident_id,event_type,actor_user_id,actor_organization_id,source_type,source_id,title,body,visibility) values($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [
      incidentId,
      input.eventType,
      input.userId,
      input.organizationId,
      input.sourceType,
      input.sourceId ?? null,
      input.title,
      input.body ?? null,
      input.visibility ?? "PUBLIC",
    ],
  );
}
export async function transition(
  userId: string,
  organizationId: string,
  incidentId: string,
  to: IncidentStatus,
  reason?: string,
) {
  return transaction(async (db) => {
    await requireAssignedGovernment(
      userId,
      organizationId,
      incidentId,
      [...managers],
      true,
      db,
    );
    const row = await db.query<{ official_status: IncidentStatus }>(
      "select official_status from incidents where id=$1 for update",
      [incidentId],
    );
    const from = row.rows[0]?.official_status;
    if (!from) throw new AppError(404, "NOT_FOUND", "Incident not found.");
    if (!incidentStatuses.includes(to) || !canTransitionIncident(from, to))
      throw new AppError(
        409,
        "INVALID_STATUS_TRANSITION",
        `Cannot move an incident from ${from} to ${to}.`,
      );
    if (
      ["BLOCKED", "REJECTED_INVALID", "IN_PROGRESS", "CLOSED"].includes(to) &&
      !reason?.trim()
    )
      throw new AppError(
        400,
        "REASON_REQUIRED",
        "A reason is required for this transition.",
      );
    await db.query(
      "update incidents set official_status=$1,updated_at=now() where id=$2",
      [to, incidentId],
    );
    const history = await db.query<{ id: string }>(
      "insert into incident_status_history(incident_id,from_status,to_status,changed_by_user_id,organization_id,reason) values($1,$2,$3,$4,$5,$6) returning id",
      [incidentId, from, to, userId, organizationId, reason ?? null],
    );
    await timeline(db, incidentId, {
      eventType: "STATUS_CHANGED",
      userId,
      organizationId,
      title: `Official status changed to ${to.replaceAll("_", " ")}`,
      body: reason ?? "",
      sourceType: "STATUS_HISTORY",
      sourceId: history.rows[0]!.id,
    });
    await db.query(
      "insert into audit_logs(actor_user_id,actor_organization_id,action,target_type,target_id,metadata) values($1,$2,'INCIDENT_STATUS_CHANGED','incident',$3,$4)",
      [
        userId,
        organizationId,
        incidentId,
        JSON.stringify({ from, to, reason }),
      ],
    );
  });
}
export async function acknowledge(
  userId: string,
  organizationId: string,
  incidentId: string,
) {
  return transaction(async (db) => {
    await requireAssignedGovernment(
      userId,
      organizationId,
      incidentId,
      [...officers],
      true,
      db,
    );
    const updated = await db.query(
      "update incidents set official_status='ACKNOWLEDGED',updated_at=now() where id=$1 and official_status='OPEN'",
      [incidentId],
    );
    if (!updated.rowCount)
      throw new AppError(
        409,
        "INVALID_STATUS_TRANSITION",
        "Only an open incident can be acknowledged.",
      );
    const history = await db.query<{ id: string }>(
      "insert into incident_status_history(incident_id,from_status,to_status,changed_by_user_id,organization_id) values($1,'OPEN','ACKNOWLEDGED',$2,$3) returning id",
      [incidentId, userId, organizationId],
    );
    await timeline(db, incidentId, {
      eventType: "ACKNOWLEDGED",
      userId,
      organizationId,
      title: "Government acknowledged the incident",
      sourceType: "STATUS_HISTORY",
      sourceId: history.rows[0]!.id,
    });
  });
}
export async function addUpdate(
  userId: string,
  organizationId: string,
  incidentId: string,
  input: { type: string; body: string; visibility: "PUBLIC" | "INTERNAL" },
) {
  return transaction(async (db) => {
    await requireAssignedGovernment(
      userId,
      organizationId,
      incidentId,
      [...officers],
      false,
      db,
    );
    const row = await db.query<{ id: string }>(
      "insert into incident_updates(incident_id,author_user_id,author_organization_id,type,body,visibility) values($1,$2,$3,$4,$5,$6) returning id",
      [
        incidentId,
        userId,
        organizationId,
        input.type,
        input.body,
        input.visibility,
      ],
    );
    await timeline(db, incidentId, {
      eventType: "OFFICIAL_UPDATE",
      userId,
      organizationId,
      title: input.type.replaceAll("_", " "),
      body: input.body,
      visibility: input.visibility,
      sourceType: "INCIDENT_UPDATE",
      sourceId: row.rows[0]!.id,
    });
    return row.rows[0]!;
  });
}
export async function requestRoutingReview(
  userId: string,
  organizationId: string,
  incidentId: string,
  reason: string,
) {
  return transaction(async (db) => {
    await requireAssignedGovernment(
      userId,
      organizationId,
      incidentId,
      [...officers],
      false,
      db,
    );
    const row = await db.query<{ id: string }>(
      "insert into routing_review_requests(incident_id,requested_by_user_id,organization_id,reason) values($1,$2,$3,$4) returning id",
      [incidentId, userId, organizationId, reason],
    );
    await timeline(db, incidentId, {
      eventType: "ROUTING_REVIEW_REQUESTED",
      userId,
      organizationId,
      title: "Routing review requested",
      body: reason,
      visibility: "INTERNAL",
      sourceType: "ROUTING_REVIEW",
      sourceId: row.rows[0]!.id,
    });
    return row.rows[0]!;
  });
}
export async function submitResolution(
  userId: string,
  organizationId: string,
  incidentId: string,
  input: {
    statement: string;
    completionDate: string;
    evidenceIds: string[];
    exemptionReason?: string;
  },
) {
  return transaction(async (db) => {
    await requireAssignedGovernment(
      userId,
      organizationId,
      incidentId,
      [...managers],
      true,
      db,
    );
    if (input.evidenceIds.length === 0 && !input.exemptionReason)
      throw new AppError(
        400,
        "RESOLUTION_EVIDENCE_REQUIRED",
        "Resolution requires approved evidence or an audited exemption reason.",
      );
    if (input.evidenceIds.length) {
      const evidence = await db.query(
        "select 1 from incident_evidence where incident_id=$1 and id=any($2::uuid[]) and uploader_organization_id=$3 and moderation_status='APPROVED'",
        [incidentId, input.evidenceIds, organizationId],
      );
      if (evidence.rowCount !== input.evidenceIds.length)
        throw new AppError(
          400,
          "INVALID_EVIDENCE",
          "Every resolution evidence item must be approved and belong to this incident.",
        );
    }
    const current = await db.query<{ official_status: IncidentStatus }>(
      "select official_status from incidents where id=$1 for update",
      [incidentId],
    );
    if (current.rows[0]?.official_status !== "IN_PROGRESS")
      throw new AppError(
        409,
        "INVALID_STATUS_TRANSITION",
        "Resolution may only be submitted from in progress.",
      );
    await db.query(
      "update incidents set official_status='RESOLUTION_SUBMITTED',community_verification_status='UNVERIFIED',updated_at=now() where id=$1",
      [incidentId],
    );
    const update = await db.query<{ id: string }>(
      "insert into incident_updates(incident_id,author_user_id,author_organization_id,type,body,visibility) values($1,$2,$3,'RESOLUTION_SUBMITTED',$4,'PUBLIC') returning id",
      [incidentId, userId, organizationId, input.statement],
    );
    await db.query(
      "insert into incident_status_history(incident_id,from_status,to_status,changed_by_user_id,organization_id,reason) values($1,'IN_PROGRESS','RESOLUTION_SUBMITTED',$2,$3,$4)",
      [incidentId, userId, organizationId, input.exemptionReason ?? null],
    );
    await timeline(db, incidentId, {
      eventType: "RESOLUTION_SUBMITTED",
      userId,
      organizationId,
      title: "Resolution submitted for community verification",
      body: input.statement,
      sourceType: "INCIDENT_UPDATE",
      sourceId: update.rows[0]!.id,
    });
    await db.query(
      "insert into audit_logs(actor_user_id,actor_organization_id,action,target_type,target_id,metadata) values($1,$2,'RESOLUTION_SUBMITTED','incident',$3,$4)",
      [userId, organizationId, incidentId, JSON.stringify(input)],
    );
  });
}
export async function inviteSupporting(
  userId: string,
  organizationId: string,
  incidentId: string,
  invitedOrganizationId: string,
  reason: string,
) {
  return transaction(async (db) => {
    await requireAssignedGovernment(
      userId,
      organizationId,
      incidentId,
      [...managers],
      true,
      db,
    );
    const eligible = await db.query(
      "select 1 from organizations where id=$1 and kind='GOVERNMENT' and active=true and verification_status='VERIFIED'",
      [invitedOrganizationId],
    );
    if (!eligible.rowCount)
      throw new AppError(
        400,
        "INVALID_ORGANIZATION",
        "Supporting organization must be verified and active.",
      );
    const row = await db.query<{ id: string }>(
      "insert into incident_coordination_requests(incident_id,requesting_organization_id,invited_organization_id,requested_by_user_id,reason) values($1,$2,$3,$4,$5) returning id",
      [incidentId, organizationId, invitedOrganizationId, userId, reason],
    );
    return row.rows[0]!;
  });
}
export async function respondCoordination(
  userId: string,
  requestId: string,
  accept: boolean,
) {
  return transaction(async (db) => {
    const item = await db.query<{
      incident_id: string;
      invited_organization_id: string;
      reason: string;
    }>(
      "select incident_id,invited_organization_id,reason from incident_coordination_requests where id=$1 and status='PENDING' for update",
      [requestId],
    );
    if (!item.rows[0])
      throw new AppError(404, "NOT_FOUND", "Coordination request not found.");
    await requireMembership(
      userId,
      item.rows[0].invited_organization_id,
      "GOVERNMENT",
      [...managers],
      db,
    );
    await db.query(
      "update incident_coordination_requests set status=$1,responded_by_user_id=$2,responded_at=now() where id=$3",
      [accept ? "ACCEPTED" : "DECLINED", userId, requestId],
    );
    if (accept) {
      await db.query(
        "insert into incident_assignments(incident_id,organization_id,role,routing_reason,routing_method) values($1,$2,'SUPPORTING',$3,'MANUAL') on conflict(incident_id,organization_id) do update set status='ACTIVE',role='SUPPORTING'",
        [
          item.rows[0].incident_id,
          item.rows[0].invited_organization_id,
          item.rows[0].reason,
        ],
      );
      await timeline(db, item.rows[0].incident_id, {
        eventType: "SUPPORTING_ORGANIZATION_ADDED",
        userId,
        organizationId: item.rows[0].invited_organization_id,
        title: "Supporting government organization joined",
        sourceType: "COORDINATION",
        sourceId: requestId,
      });
    }
  });
}
