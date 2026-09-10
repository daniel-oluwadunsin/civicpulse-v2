import {
  canTransitionIntervention,
  interventionTypes,
  type InterventionStatus,
  type InterventionType,
} from "@civicpulse/shared";
import type { PoolClient } from "pg";
import { query, transaction } from "../../db/pool.js";
import { AppError } from "../../utils/errors.js";
import {
  requireAssignedGovernment,
  requireMembership,
} from "../authorization.js";
const ngoWorkers = ["OFFICER", "MANAGER", "ORG_ADMIN"] as const,
  managers = ["MANAGER", "ORG_ADMIN"] as const;
type ProposalRow = Record<string, unknown> & {
  id: string;
  incident_id: string;
  lead_organization_id: string;
  status: InterventionStatus;
  physical_work: boolean;
};
async function event(
  db: PoolClient,
  incidentId: string,
  type: string,
  userId: string,
  organizationId: string,
  title: string,
  body?: string,
  visibility = "PUBLIC",
  sourceId?: string,
) {
  await db.query(
    "insert into incident_timeline_events(incident_id,event_type,actor_user_id,actor_organization_id,source_type,source_id,title,body,visibility) values($1,$2,$3,$4,'INTERVENTION',$5,$6,$7,$8)",
    [
      incidentId,
      type,
      userId,
      organizationId,
      sourceId ?? null,
      title,
      body ?? null,
      visibility,
    ],
  );
}
export async function discover(filters: {
  category?: string;
  stateId?: string;
  lgaId?: string;
  status?: string;
}) {
  const v: unknown[] = [];
  const w = [
    "i.public_visibility='PUBLIC'",
    "i.official_status not in ('CLOSED','REJECTED_INVALID')",
  ];
  for (const [key, column] of [
    [filters.category, "i.category"],
    [filters.stateId, "i.state_jurisdiction_id"],
    [filters.lgaId, "i.lga_jurisdiction_id"],
    [filters.status, "i.official_status"],
  ] as const)
    if (key) {
      v.push(key);
      w.push(`${column}=$${v.length}`);
    }
  return (
    await query(
      `select i.id,i.public_reference,i.title,i.summary,i.category,i.official_status,i.community_verification_status,i.report_count,i.severity,case when i.public_location_precision='EXACT' then ST_Y(i.location) else ST_Y(ST_SnapToGrid(i.location,0.005)) end latitude,case when i.public_location_precision='EXACT' then ST_X(i.location) else ST_X(ST_SnapToGrid(i.location,0.005)) end longitude,l.name lga_name,s.name state_name,(select count(*)::int from affected_confirmations a where a.incident_id=i.id) affected_count,(select count(*)::int from intervention_proposals p where p.incident_id=i.id and p.status not in ('REJECTED','WITHDRAWN','EXPIRED')) intervention_count from incidents i left join jurisdictions l on l.id=i.lga_jurisdiction_id left join jurisdictions s on s.id=i.state_jurisdiction_id where ${w.join(" and ")} order by i.severity desc,i.updated_at desc`,
      v,
    )
  ).rows;
}

export async function overview(userId: string, organizationId: string) {
  await requireMembership(userId, organizationId, "NGO", [...ngoWorkers]);
  const result = await query<{
    relevant_issues: number;
    proposals: number;
    approvals: number;
    authorized_work: number;
    milestones: number;
    inspections: number;
    handovers: number;
  }>(
    `select
      (select count(*)::int from incidents where public_visibility='PUBLIC' and official_status not in ('CLOSED','REJECTED_INVALID')) relevant_issues,
      (select count(*)::int from intervention_proposals where lead_organization_id=$1 and status not in ('REJECTED','WITHDRAWN','EXPIRED')) proposals,
      (select count(*)::int from intervention_approvals a join intervention_proposals p on p.id=a.proposal_id where p.lead_organization_id=$1 and a.status='REQUIRED') approvals,
      (select count(*)::int from intervention_proposals where lead_organization_id=$1 and status in ('AUTHORIZED_TO_COMMENCE','IN_PROGRESS')) authorized_work,
      (select count(*)::int from intervention_milestones m join intervention_proposals p on p.id=m.proposal_id where p.lead_organization_id=$1) milestones,
      (select count(*)::int from intervention_inspections i join intervention_proposals p on p.id=i.proposal_id where p.lead_organization_id=$1) inspections,
      (select count(*)::int from intervention_handover h join intervention_proposals p on p.id=h.proposal_id where p.lead_organization_id=$1) handovers`,
    [organizationId],
  );
  const row = result.rows[0]!;
  return {
    relevantIssues: row.relevant_issues,
    proposals: row.proposals,
    approvals: row.approvals,
    authorizedWork: row.authorized_work,
    milestones: row.milestones,
    inspections: row.inspections,
    handovers: row.handovers,
  };
}
export async function interest(
  userId: string,
  organizationId: string,
  incidentId: string,
  input: {
    participationTypes: InterventionType[];
    note?: string;
    visibility: "PUBLIC" | "PRIVATE";
  },
) {
  return transaction(async (db) => {
    await requireMembership(userId, organizationId, "NGO", [...ngoWorkers], db);
    const incident = await db.query(
      "select 1 from incidents where id=$1 and public_visibility='PUBLIC' and official_status not in ('CLOSED','REJECTED_INVALID')",
      [incidentId],
    );
    if (!incident.rowCount)
      throw new AppError(404, "NOT_FOUND", "Eligible incident not found.");
    const row = await db.query<{ id: string }>(
      "insert into intervention_expressions_of_interest(incident_id,organization_id,participation_types,note,visibility) values($1,$2,$3,$4,$5) on conflict(incident_id,organization_id) do update set participation_types=excluded.participation_types,note=excluded.note,visibility=excluded.visibility returning id",
      [
        incidentId,
        organizationId,
        JSON.stringify(input.participationTypes),
        input.note ?? null,
        input.visibility,
      ],
    );
    if (input.visibility === "PUBLIC")
      await event(
        db,
        incidentId,
        "NGO_INTEREST",
        userId,
        organizationId,
        "Verified NGO expressed interest",
        input.note,
        "PUBLIC",
        row.rows[0]!.id,
      );
    return row.rows[0]!;
  });
}
export async function removeInterest(
  userId: string,
  organizationId: string,
  incidentId: string,
) {
  await requireMembership(userId, organizationId, "NGO", [...ngoWorkers]);
  await query(
    "delete from intervention_expressions_of_interest where incident_id=$1 and organization_id=$2",
    [incidentId, organizationId],
  );
}
export async function createProposal(
  userId: string,
  input: {
    organizationId: string;
    incidentId: string;
    interventionTypes: InterventionType[];
    physicalWork: boolean;
    budgetAmount?: number;
    currency?: string;
    fundingStatus?: string;
    plannedStart?: string;
    plannedEnd?: string;
    payload: Record<string, unknown>;
  },
) {
  await requireMembership(userId, input.organizationId, "NGO", [...ngoWorkers]);
  const incident = await query(
    "select 1 from incidents where id=$1 and public_visibility='PUBLIC' and official_status not in ('CLOSED','REJECTED_INVALID')",
    [input.incidentId],
  );
  if (!incident.rowCount)
    throw new AppError(404, "NOT_FOUND", "Eligible incident not found.");
  const row = await query<{ id: string }>(
    "insert into intervention_proposals(incident_id,lead_organization_id,intervention_types,physical_work,budget_amount,currency,funding_status,planned_start,planned_end,payload) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id",
    [
      input.incidentId,
      input.organizationId,
      JSON.stringify(input.interventionTypes),
      input.physicalWork,
      input.budgetAmount ?? null,
      input.currency ?? null,
      input.fundingStatus ?? null,
      input.plannedStart ?? null,
      input.plannedEnd ?? null,
      JSON.stringify(input.payload),
    ],
  );
  return row.rows[0]!;
}
export async function updateProposal(
  userId: string,
  proposalId: string,
  input: {
    organizationId: string;
    interventionTypes?: InterventionType[];
    physicalWork?: boolean;
    payload?: Record<string, unknown>;
  },
) {
  return transaction(async (db) => {
    await requireMembership(
      userId,
      input.organizationId,
      "NGO",
      [...ngoWorkers],
      db,
    );
    const row = await db.query<{
      status: InterventionStatus;
      version: number;
      payload: Record<string, unknown>;
    }>(
      "select status,version,payload from intervention_proposals where id=$1 and lead_organization_id=$2 for update",
      [proposalId, input.organizationId],
    );
    if (
      !row.rows[0] ||
      !["DRAFT", "CHANGES_REQUESTED"].includes(row.rows[0].status)
    )
      throw new AppError(
        409,
        "INTERVENTION_NOT_EDITABLE",
        "Only draft or changes-requested proposals may be edited.",
      );
    await db.query(
      "insert into intervention_revisions(proposal_id,version,payload,created_by) values($1,$2,$3,$4) on conflict do nothing",
      [
        proposalId,
        row.rows[0].version,
        JSON.stringify(row.rows[0].payload),
        userId,
      ],
    );
    await db.query(
      "update intervention_proposals set intervention_types=coalesce($1,intervention_types),physical_work=coalesce($2,physical_work),payload=coalesce($3,payload),version=version+1,updated_at=now() where id=$4",
      [
        input.interventionTypes
          ? JSON.stringify(input.interventionTypes)
          : null,
        input.physicalWork ?? null,
        input.payload ? JSON.stringify(input.payload) : null,
        proposalId,
      ],
    );
  });
}
async function proposalForUpdate(db: PoolClient, proposalId: string) {
  const row = await db.query<ProposalRow>(
    "select * from intervention_proposals where id=$1 for update",
    [proposalId],
  );
  if (!row.rows[0])
    throw new AppError(404, "NOT_FOUND", "Intervention proposal not found.");
  return row.rows[0];
}
async function setStatus(
  db: PoolClient,
  p: ProposalRow,
  to: InterventionStatus,
  userId: string,
  organizationId: string,
  reason?: string,
) {
  if (!canTransitionIntervention(p.status, to))
    throw new AppError(
      409,
      "INVALID_INTERVENTION_TRANSITION",
      `Cannot move an intervention from ${p.status} to ${to}.`,
    );
  await db.query(
    "update intervention_proposals set status=$1,review_reason=$2,reviewed_by=$3,reviewed_at=case when $1 in ('CHANGES_REQUESTED','REJECTED','APPROVED_IN_PRINCIPLE') then now() else reviewed_at end,submitted_at=case when $1 in ('SUBMITTED','RESUBMITTED') then now() else submitted_at end,updated_at=now() where id=$4",
    [to, reason ?? null, userId, p.id],
  );
  await db.query(
    "insert into audit_logs(actor_user_id,actor_organization_id,action,target_type,target_id,metadata) values($1,$2,'INTERVENTION_STATUS_CHANGED','intervention',$3,$4)",
    [
      userId,
      organizationId,
      p.id,
      JSON.stringify({ from: p.status, to, reason }),
    ],
  );
  await event(
    db,
    p.incident_id,
    "INTERVENTION_STATUS",
    userId,
    organizationId,
    `Intervention: ${to.replaceAll("_", " ")}`,
    reason,
    "PUBLIC",
    p.id,
  );
  p.status = to;
}
export async function ngoTransition(
  userId: string,
  organizationId: string,
  proposalId: string,
  to: "SUBMITTED" | "RESUBMITTED" | "WITHDRAWN",
) {
  return transaction(async (db) => {
    await requireMembership(userId, organizationId, "NGO", [...managers], db);
    const p = await proposalForUpdate(db, proposalId);
    if (p.lead_organization_id !== organizationId)
      throw new AppError(
        403,
        "FORBIDDEN",
        "This proposal belongs to another NGO.",
      );
    await setStatus(db, p, to, userId, organizationId);
  });
}
export async function governmentReview(
  userId: string,
  organizationId: string,
  proposalId: string,
  to:
    | "UNDER_REVIEW"
    | "CHANGES_REQUESTED"
    | "REJECTED"
    | "APPROVED_IN_PRINCIPLE"
    | "AWAITING_APPROVALS"
    | "EXPIRED",
  reason?: string,
) {
  return transaction(async (db) => {
    const p = await proposalForUpdate(db, proposalId);
    await requireAssignedGovernment(
      userId,
      organizationId,
      p.incident_id,
      [...managers],
      true,
      db,
    );
    if (["CHANGES_REQUESTED", "REJECTED", "EXPIRED"].includes(to) && !reason)
      throw new AppError(
        400,
        "REASON_REQUIRED",
        "A review reason is required.",
      );
    await setStatus(db, p, to, userId, organizationId, reason);
  });
}
export async function addApproval(
  userId: string,
  organizationId: string,
  proposalId: string,
  input: {
    authorityOrganizationId: string;
    approvalType: string;
    reason: string;
    requiredDocuments: string[];
  },
) {
  return transaction(async (db) => {
    const p = await proposalForUpdate(db, proposalId);
    await requireAssignedGovernment(
      userId,
      organizationId,
      p.incident_id,
      [...managers],
      true,
      db,
    );
    if (!["APPROVED_IN_PRINCIPLE", "AWAITING_APPROVALS"].includes(p.status))
      throw new AppError(
        409,
        "INVALID_INTERVENTION_TRANSITION",
        "Approval requirements may only be added after in-principle approval.",
      );
    const authority = await db.query(
      "select 1 from organizations where id=$1 and kind='GOVERNMENT' and active=true and verification_status='VERIFIED'",
      [input.authorityOrganizationId],
    );
    if (!authority.rowCount)
      throw new AppError(
        400,
        "INVALID_AUTHORITY",
        "Approval authority must be a verified government organization.",
      );
    const row = await db.query<{ id: string }>(
      "insert into intervention_approvals(proposal_id,authority_organization_id,approval_type,reason,required_documents) values($1,$2,$3,$4,$5) returning id",
      [
        proposalId,
        input.authorityOrganizationId,
        input.approvalType,
        input.reason,
        JSON.stringify(input.requiredDocuments),
      ],
    );
    if (p.status === "APPROVED_IN_PRINCIPLE")
      await setStatus(db, p, "AWAITING_APPROVALS", userId, organizationId);
    return row.rows[0]!;
  });
}
export async function decideApproval(
  userId: string,
  organizationId: string,
  approvalId: string,
  input: {
    decision: "SATISFIED" | "REJECTED";
    conditions?: string;
    issuedDocumentPublicId?: string;
    expiresAt?: string;
  },
) {
  return transaction(async (db) => {
    const approval = await db.query<
      Record<string, unknown> & {
        incident_id: string;
        authority_organization_id: string;
        required_documents: unknown;
      }
    >(
      "select a.*,p.incident_id from intervention_approvals a join intervention_proposals p on p.id=a.proposal_id where a.id=$1 for update",
      [approvalId],
    );
    const a = approval.rows[0];
    if (!a)
      throw new AppError(404, "NOT_FOUND", "Approval requirement not found.");
    if (a.authority_organization_id !== organizationId)
      throw new AppError(
        403,
        "FORBIDDEN",
        "Only the named authority may decide this approval.",
      );
    if (
      input.decision === "SATISFIED" &&
      Array.isArray(a.required_documents) &&
      a.required_documents.length > 0 &&
      !input.issuedDocumentPublicId
    )
      throw new AppError(
        400,
        "APPROVAL_DOCUMENT_REQUIRED",
        "This approval requires a verified supporting document.",
      );
    await requireMembership(
      userId,
      organizationId,
      "GOVERNMENT",
      [...managers],
      db,
    );
    await db.query(
      "update intervention_approvals set status=$1,conditions=$2,issued_document_public_id=$3,issued_at=case when $1='SATISFIED' then now() end,expires_at=$4,reviewer_user_id=$5 where id=$6",
      [
        input.decision,
        input.conditions ?? null,
        input.issuedDocumentPublicId ?? null,
        input.expiresAt ?? null,
        userId,
        approvalId,
      ],
    );
    await event(
      db,
      a.incident_id,
      "INTERVENTION_APPROVAL",
      userId,
      organizationId,
      `Required approval ${input.decision.toLowerCase()}`,
      input.conditions,
      "PUBLIC",
      approvalId,
    );
  });
}
export async function authorize(
  userId: string,
  organizationId: string,
  proposalId: string,
) {
  return transaction(async (db) => {
    const p = await proposalForUpdate(db, proposalId);
    await requireAssignedGovernment(
      userId,
      organizationId,
      p.incident_id,
      [...managers],
      true,
      db,
    );
    if (p.status !== "AWAITING_APPROVALS")
      throw new AppError(
        409,
        "INVALID_INTERVENTION_TRANSITION",
        "Proposal is not ready for authorization.",
      );
    const approvals = await db.query<{ total: number; open: number }>(
      "select count(*)::int total,count(*) filter(where status<>'SATISFIED' or (expires_at is not null and expires_at<=now()))::int open from intervention_approvals where proposal_id=$1",
      [proposalId],
    );
    if (p.physical_work && Number(approvals.rows[0]?.total) === 0)
      throw new AppError(
        409,
        "INTERVENTION_NOT_AUTHORIZED",
        "Physical work requires at least one competent-authority approval.",
      );
    if (Number(approvals.rows[0]?.open) > 0)
      throw new AppError(
        409,
        "INTERVENTION_NOT_AUTHORIZED",
        "Every required approval must be satisfied and unexpired.",
      );
    await setStatus(db, p, "AUTHORIZED_TO_COMMENCE", userId, organizationId);
  });
}
export async function startWork(
  userId: string,
  organizationId: string,
  proposalId: string,
) {
  return transaction(async (db) => {
    await requireMembership(userId, organizationId, "NGO", [...managers], db);
    const p = await proposalForUpdate(db, proposalId);
    if (p.lead_organization_id !== organizationId)
      throw new AppError(
        403,
        "FORBIDDEN",
        "This proposal belongs to another NGO.",
      );
    await setStatus(db, p, "IN_PROGRESS", userId, organizationId);
  });
}
export async function addMilestone(
  userId: string,
  organizationId: string,
  proposalId: string,
  input: { title: string; details?: string; dueDate?: string },
) {
  return transaction(async (db) => {
    await requireMembership(userId, organizationId, "NGO", [...ngoWorkers], db);
    const p = await proposalForUpdate(db, proposalId);
    if (p.lead_organization_id !== organizationId || p.status !== "IN_PROGRESS")
      throw new AppError(
        409,
        "INVALID_INTERVENTION_TRANSITION",
        "Milestones may be added only while work is in progress.",
      );
    const row = await db.query<{ id: string }>(
      "insert into intervention_milestones(proposal_id,title,details,due_date) values($1,$2,$3,$4) returning id",
      [proposalId, input.title, input.details ?? null, input.dueDate ?? null],
    );
    await event(
      db,
      p.incident_id,
      "INTERVENTION_MILESTONE",
      userId,
      organizationId,
      input.title,
      input.details,
      "PUBLIC",
      row.rows[0]!.id,
    );
    return row.rows[0]!;
  });
}
export async function completion(
  userId: string,
  organizationId: string,
  proposalId: string,
  statement: string,
  payload: Record<string, unknown>,
) {
  return transaction(async (db) => {
    await requireMembership(userId, organizationId, "NGO", [...managers], db);
    const p = await proposalForUpdate(db, proposalId);
    if (p.lead_organization_id !== organizationId)
      throw new AppError(
        403,
        "FORBIDDEN",
        "This proposal belongs to another NGO.",
      );
    await setStatus(db, p, "COMPLETION_SUBMITTED", userId, organizationId);
    await db.query(
      "insert into intervention_completion_submissions(proposal_id,submitted_by,statement,payload) values($1,$2,$3,$4)",
      [proposalId, userId, statement, JSON.stringify(payload)],
    );
  });
}
export async function inspect(
  userId: string,
  organizationId: string,
  proposalId: string,
  decision: "ACCEPTED" | "REMEDIATION_REQUIRED" | "REJECTED",
  notes: string,
) {
  return transaction(async (db) => {
    const p = await proposalForUpdate(db, proposalId);
    await requireAssignedGovernment(
      userId,
      organizationId,
      p.incident_id,
      [...managers],
      true,
      db,
    );
    if (p.status === "COMPLETION_SUBMITTED")
      await setStatus(db, p, "INSPECTION", userId, organizationId);
    await setStatus(db, p, decision, userId, organizationId, notes);
    await db.query(
      "insert into intervention_inspections(proposal_id,organization_id,inspector_user_id,decision,notes) values($1,$2,$3,$4,$5)",
      [proposalId, organizationId, userId, decision, notes],
    );
  });
}
export async function handover(
  userId: string,
  organizationId: string,
  proposalId: string,
  notes: string,
) {
  return transaction(async (db) => {
    const p = await proposalForUpdate(db, proposalId);
    await requireAssignedGovernment(
      userId,
      organizationId,
      p.incident_id,
      [...managers],
      true,
      db,
    );
    await setStatus(db, p, "HANDOVER_COMPLETE", userId, organizationId, notes);
    await db.query(
      "insert into intervention_handover(proposal_id,organization_id,completed_by,notes) values($1,$2,$3,$4)",
      [proposalId, organizationId, userId, notes],
    );
  });
}
export async function listForOrganization(
  userId: string,
  organizationId: string,
) {
  await requireMembership(userId, organizationId, "NGO", [...ngoWorkers]);
  return (
    await query(
      "select p.*,i.title incident_title,i.public_reference from intervention_proposals p join incidents i on i.id=p.incident_id where p.lead_organization_id=$1 order by p.updated_at desc",
      [organizationId],
    )
  ).rows;
}
export { interventionTypes };
