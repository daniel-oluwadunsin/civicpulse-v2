import type { PoolClient } from "pg";
import { query, transaction } from "../../db/pool.js";
import { AppError } from "../../utils/errors.js";
import { decodeCursor, encodeCursor } from "../../utils/pagination.js";
import type { z } from "zod";
import type { feedQuerySchema } from "./incidents.schemas.js";
import { aggregateCommunityVerification } from "@civicpulse/shared";
import { recordOrganizationMentions } from "../mentions.js";

type FeedRow = Record<string, unknown> & {
  id: string;
  updated_at: string;
  distance_m: number | null;
  relevance_score: number | null;
};
type TimelineRow = Record<string, unknown> & {
  id: string;
  created_at: string;
};
export async function filterOptions() {
  const [areas, organizations] = await Promise.all([
    query(
      "select id,name,type,parent_id from jurisdictions where active=true and type in ('STATE','LGA') order by type desc,name",
    ),
    query(
      "select id,kind,coalesce(display_name,official_name) name from organizations where active=true and verification_status='VERIFIED' order by name",
    ),
  ]);
  return { areas: areas.rows, organizations: organizations.rows };
}

export async function listIncidents(
  input: z.infer<typeof feedQuerySchema>,
  userId?: string,
) {
  const cursor = decodeCursor(input.cursor);
  if (
    input.feed === "nearby" &&
    (input.latitude === undefined || input.longitude === undefined)
  )
    throw new AppError(
      400,
      "LOCATION_REQUIRED",
      "Nearby incidents require a current location.",
    );
  if (input.feed === "following" && !userId)
    throw new AppError(
      401,
      "UNAUTHORIZED",
      "Sign in to view followed incidents.",
    );
  const values: unknown[] = [userId ?? null, input.limit + 1];
  const filters = ["i.public_visibility='PUBLIC'"];
  const add = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  if (input.category) filters.push(`i.category=${add(input.category)}`);
  if (input.officialStatus)
    filters.push(`i.official_status=${add(input.officialStatus)}`);
  if (input.communityStatus)
    filters.push(
      `i.community_verification_status=${add(input.communityStatus)}`,
    );
  if (input.lgaId) filters.push(`i.lga_jurisdiction_id=${add(input.lgaId)}`);
  if (input.stateId)
    filters.push(`i.state_jurisdiction_id=${add(input.stateId)}`);
  if (input.organizationId)
    filters.push(
      `exists(select 1 from incident_assignments ia where ia.incident_id=i.id and ia.organization_id=${add(input.organizationId)} and ia.status='ACTIVE')`,
    );
  if (input.updatedSince)
    filters.push(
      `i.updated_at>=${add(input.updatedSince.toISOString())}::timestamptz`,
    );
  const distance =
    input.latitude !== undefined && input.longitude !== undefined
      ? `ST_Distance(i.location::geography,ST_SetSRID(ST_MakePoint(${add(input.longitude)},${add(input.latitude)}),4326)::geography)`
      : "null::float";
  const relevance = `(i.severity*10
    + greatest(0,20-least(20,extract(epoch from (now()-i.updated_at))/86400))
    + least(20,extract(epoch from (now()-i.first_reported_at))/86400)
    + case when $1::uuid is not null and (
        exists(select 1 from incident_follows f where f.incident_id=i.id and f.user_id=$1)
        or exists(select 1 from followed_categories fc where fc.category=i.category and fc.user_id=$1)
        or exists(select 1 from followed_areas fa where fa.user_id=$1 and fa.jurisdiction_id in (i.lga_jurisdiction_id,i.state_jurisdiction_id))
        or exists(select 1 from followed_organizations fo join incident_assignments fia on fia.organization_id=fo.organization_id where fo.user_id=$1 and fia.incident_id=i.id and fia.status='ACTIVE')
      ) then 30 else 0 end
    + case when exists(select 1 from incident_timeline_events te where te.incident_id=i.id and te.visibility='PUBLIC' and te.created_at>now()-interval '14 days') then 5 else 0 end
    + case when (${distance}) is not null then greatest(0,10-least(10,(${distance})/5000)) else 0 end
    + least(5,greatest(-5,coalesce((select count(*) filter(where reaction='UP')-count(*) filter(where reaction='DOWN') from incident_reactions rr where rr.incident_id=i.id),0))))`;
  if (cursor) {
    const at = add(cursor.at);
    const id = add(cursor.id);
    if (input.feed === "nearby") {
      if (cursor.distance === undefined)
        throw new AppError(
          400,
          "INVALID_CURSOR",
          "The nearby pagination cursor is invalid.",
        );
      const cursorDistance = add(cursor.distance);
      filters.push(
        `((${distance})>${cursorDistance} or ((${distance})=${cursorDistance} and (i.updated_at,i.id)<(${at}::timestamptz,${id}::uuid)))`,
      );
    } else if (input.feed === "for-you") {
      if (cursor.score === undefined)
        throw new AppError(
          400,
          "INVALID_CURSOR",
          "The personalized pagination cursor is invalid.",
        );
      const score = add(cursor.score);
      filters.push(
        `((${relevance})<${score} or ((${relevance})=${score} and (i.updated_at,i.id)<(${at}::timestamptz,${id}::uuid)))`,
      );
    } else filters.push(`(i.updated_at,i.id)<(${at}::timestamptz,${id}::uuid)`);
  }
  if (input.feed === "following")
    filters.push(
      `(exists(select 1 from incident_follows f where f.incident_id=i.id and f.user_id=$1) or exists(select 1 from followed_categories fc where fc.category=i.category and fc.user_id=$1) or exists(select 1 from followed_areas fa where fa.user_id=$1 and fa.jurisdiction_id in (i.lga_jurisdiction_id,i.state_jurisdiction_id)) or exists(select 1 from followed_organizations fo join incident_assignments ia on ia.organization_id=fo.organization_id where fo.user_id=$1 and ia.incident_id=i.id and ia.status='ACTIVE'))`,
    );
  const order =
    input.feed === "nearby"
      ? "distance_m asc nulls last,i.updated_at desc,i.id desc"
      : input.feed === "for-you"
        ? "relevance_score desc,i.updated_at desc,i.id desc"
        : "i.updated_at desc,i.id desc";
  const result = await query<FeedRow>(
    `select i.id,i.public_reference,i.title,i.summary,i.category,i.official_status,i.community_verification_status,i.report_count,i.severity,i.updated_at,i.first_reported_at,
      case when i.public_location_precision='EXACT' then ST_Y(i.location) else ST_Y(ST_SnapToGrid(i.location,0.005)) end latitude,
      case when i.public_location_precision='EXACT' then ST_X(i.location) else ST_X(ST_SnapToGrid(i.location,0.005)) end longitude,
      l.name lga_name,s.name state_name,${distance} distance_m,${relevance} relevance_score,
      (select count(*)::int from affected_confirmations a where a.incident_id=i.id) affected_count,
      (select count(*)::int from incident_comments c where c.incident_id=i.id and c.moderation_status='PUBLISHED' and c.deleted_at is null) comment_count,
      (select count(*) filter(where reaction='UP')::int-count(*) filter(where reaction='DOWN')::int from incident_reactions r where r.incident_id=i.id) reaction_score,
      (select jsonb_build_object('title',te.title,'createdAt',te.created_at) from incident_timeline_events te where te.incident_id=i.id and te.visibility='PUBLIC' order by te.created_at desc,te.id desc limit 1) latest_update,
      exists(select 1 from incident_follows f where f.incident_id=i.id and f.user_id=$1) viewer_follows,
      (select jsonb_agg(jsonb_build_object('id',o.id,'name',coalesce(o.display_name,o.official_name),'kind',o.kind,'verified',true,'role',ia.role)) from incident_assignments ia join organizations o on o.id=ia.organization_id where ia.incident_id=i.id and ia.status='ACTIVE' and o.active=true and o.verification_status='VERIFIED') organizations
     from incidents i left join jurisdictions l on l.id=i.lga_jurisdiction_id left join jurisdictions s on s.id=i.state_jurisdiction_id
     where ${filters.join(" and ")} order by ${order} limit $2`,
    values,
  );
  const hasMore = result.rows.length > input.limit;
  const rows = result.rows.slice(0, input.limit);
  const last = rows.at(-1);
  return {
    data: rows,
    page: {
      nextCursor:
        hasMore && last
          ? encodeCursor({
              at: new Date(last.updated_at).toISOString(),
              id: last.id,
              ...(input.feed === "nearby"
                ? { distance: Number(last.distance_m) }
                : input.feed === "for-you"
                  ? { score: Number(last.relevance_score) }
                  : {}),
            })
          : null,
    },
  };
}

export async function getPublicIncident(id: string, userId?: string) {
  const result = await query<Record<string, unknown>>(
    `select i.id,i.public_reference,i.title,i.summary,i.category,i.subcategory,i.official_status,i.community_verification_status,i.report_count,i.severity,i.first_reported_at,i.last_reported_at,
      case when i.public_location_precision='EXACT' then ST_Y(i.location) else ST_Y(ST_SnapToGrid(i.location,0.005)) end latitude,
      case when i.public_location_precision='EXACT' then ST_X(i.location) else ST_X(ST_SnapToGrid(i.location,0.005)) end longitude,l.name lga_name,s.name state_name,
      (select count(*)::int from affected_confirmations where incident_id=i.id) affected_count,
      (select count(*)::int from incident_confirmations where incident_id=i.id) confirmation_count,
      (select reaction from incident_reactions where incident_id=i.id and user_id=$2) viewer_reaction,
      exists(select 1 from affected_confirmations where incident_id=i.id and user_id=$2) viewer_affected,
      exists(select 1 from incident_confirmations where incident_id=i.id and user_id=$2) viewer_confirms,
      exists(select 1 from incident_follows where incident_id=i.id and user_id=$2) viewer_follows,
      (select jsonb_agg(jsonb_build_object('id',o.id,'name',coalesce(o.display_name,o.official_name),'kind',o.kind,'verified',true,'role',ia.role,'reason',ia.routing_reason)) from incident_assignments ia join organizations o on o.id=ia.organization_id where ia.incident_id=i.id and ia.status='ACTIVE' and o.active=true and o.verification_status='VERIFIED') organizations
     from incidents i left join jurisdictions l on l.id=i.lga_jurisdiction_id left join jurisdictions s on s.id=i.state_jurisdiction_id where i.id=$1 and i.public_visibility='PUBLIC'`,
    [id, userId ?? null],
  );
  if (!result.rows[0])
    throw new AppError(404, "NOT_FOUND", "Incident not found.");
  return result.rows[0];
}

async function ensurePublicIncident(db: PoolClient, id: string) {
  const found = await db.query(
    "select 1 from incidents where id=$1 and public_visibility='PUBLIC'",
    [id],
  );
  if (!found.rowCount)
    throw new AppError(404, "NOT_FOUND", "Incident not found.");
}
export async function setReaction(
  incidentId: string,
  userId: string,
  reaction: "UP" | "DOWN" | null,
) {
  await transaction(async (db) => {
    await ensurePublicIncident(db, incidentId);
    if (!reaction)
      await db.query(
        "delete from incident_reactions where incident_id=$1 and user_id=$2",
        [incidentId, userId],
      );
    else
      await db.query(
        "insert into incident_reactions(incident_id,user_id,reaction) values($1,$2,$3) on conflict(incident_id,user_id) do update set reaction=excluded.reaction,created_at=now()",
        [incidentId, userId, reaction],
      );
  });
}
export async function toggleSimple(
  table:
    "affected_confirmations" | "incident_confirmations" | "incident_follows",
  incidentId: string,
  userId: string,
  enabled: boolean,
) {
  await transaction(async (db) => {
    await ensurePublicIncident(db, incidentId);
    if (enabled)
      await db.query(
        `insert into ${table}(incident_id,user_id) values($1,$2) on conflict do nothing`,
        [incidentId, userId],
      );
    else
      await db.query(
        `delete from ${table} where incident_id=$1 and user_id=$2`,
        [incidentId, userId],
      );
  });
}
export async function listTimeline(incidentId: string, cursorValue?: string) {
  const cursor = decodeCursor(cursorValue);
  const values: unknown[] = [incidentId];
  let filter = "";
  if (cursor) {
    values.push(cursor.at, cursor.id);
    filter = "and (created_at,id)<($2::timestamptz,$3::uuid)";
  }
  values.push(21);
  const result = await query<TimelineRow>(
    `select id,event_type,title,body,actor_organization_id,metadata,created_at from incident_timeline_events te where incident_id=$1 and visibility='PUBLIC' and not exists(select 1 from incident_updates iu where te.source_type='INCIDENT_UPDATE' and iu.id=te.source_id and iu.moderation_status<>'PUBLISHED') ${filter} order by created_at desc,id desc limit $${values.length}`,
    values,
  );
  const rows = result.rows.slice(0, 20),
    last = rows.at(-1);
  return {
    data: rows,
    page: {
      nextCursor:
        result.rows.length > 20 && last
          ? encodeCursor({
              at: new Date(last.created_at).toISOString(),
              id: last.id,
            })
          : null,
    },
  };
}
export async function listEvidence(incidentId: string) {
  if (
    !(
      await query(
        "select 1 from incidents where id=$1 and public_visibility='PUBLIC'",
        [incidentId],
      )
    ).rowCount
  )
    throw new AppError(404, "NOT_FOUND", "Incident not found.");
  return (
    await query(
      `select id,kind,description,resource_type,mime_type,public_derivative_url,created_at from incident_evidence where incident_id=$1 and visibility='PUBLIC' and moderation_status='APPROVED' and public_derivative_url is not null order by created_at desc`,
      [incidentId],
    )
  ).rows;
}
export async function listComments(incidentId: string) {
  if (
    !(
      await query(
        "select 1 from incidents where id=$1 and public_visibility='PUBLIC'",
        [incidentId],
      )
    ).rowCount
  )
    throw new AppError(404, "NOT_FOUND", "Incident not found.");
  return (
    await query(
      `select c.id,c.body,c.author_user_id,c.parent_comment_id,c.created_at,c.edited_at,c.deleted_at,(c.created_at>now()-interval '15 minutes') edit_window_open,u.display_name,o.id organization_id,coalesce(o.display_name,o.official_name) organization_name,o.kind organization_kind,(o.verification_status='VERIFIED') organization_verified from incident_comments c join users u on u.id=c.author_user_id left join organizations o on o.id=c.author_organization_id where c.incident_id=$1 and c.moderation_status='PUBLISHED' order by c.created_at`,
      [incidentId],
    )
  ).rows;
}
export async function createComment(
  incidentId: string,
  userId: string,
  body: string,
  parentCommentId?: string,
  organizationId?: string,
  mentionedOrganizationIds: string[] = [],
) {
  return transaction(async (db) => {
    await ensurePublicIncident(db, incidentId);
    if (organizationId) {
      const attribution = await db.query(
        "select 1 from organization_members m join organizations o on o.id=m.organization_id where m.organization_id=$1 and m.user_id=$2 and m.membership_status='ACTIVE' and o.active=true and o.verification_status='VERIFIED'",
        [organizationId, userId],
      );
      if (!attribution.rowCount)
        throw new AppError(
          403,
          "INVALID_ATTRIBUTION",
          "Only an active member may comment for a verified organization.",
        );
    }
    if (parentCommentId) {
      const parent = await db.query<{ parent_comment_id: string | null }>(
        "select parent_comment_id from incident_comments where id=$1 and incident_id=$2 and moderation_status='PUBLISHED'",
        [parentCommentId, incidentId],
      );
      if (!parent.rows[0])
        throw new AppError(
          400,
          "INVALID_PARENT",
          "Reply target was not found.",
        );
      if (parent.rows[0].parent_comment_id)
        throw new AppError(
          400,
          "REPLY_DEPTH_EXCEEDED",
          "Replies may be nested one level.",
        );
    }
    const row = await db.query<{ id: string }>(
      "insert into incident_comments(incident_id,author_user_id,parent_comment_id,body,author_organization_id) values($1,$2,$3,$4,$5) returning id",
      [
        incidentId,
        userId,
        parentCommentId ?? null,
        body,
        organizationId ?? null,
      ],
    );
    await recordOrganizationMentions(db, {
      organizationIds: mentionedOrganizationIds,
      actorUserId: userId,
      targetType: "COMMENT",
      targetId: row.rows[0]!.id,
      preview: body,
    });
    return row.rows[0]!;
  });
}
export async function editComment(
  incidentId: string,
  commentId: string,
  userId: string,
  body: string,
) {
  const result = await transaction(async (db) => {
    const old = await db.query<{ body: string }>(
      "select body from incident_comments where id=$1 and incident_id=$2 and author_user_id=$3 and deleted_at is null and created_at>now()-interval '15 minutes' for update",
      [commentId, incidentId, userId],
    );
    if (!old.rows[0])
      throw new AppError(
        403,
        "COMMENT_EDIT_WINDOW_CLOSED",
        "Comments can only be edited by their author within 15 minutes.",
      );
    await db.query(
      "insert into incident_comment_revisions(comment_id,prior_body,edited_by) values($1,$2,$3)",
      [commentId, old.rows[0].body, userId],
    );
    return db.query(
      "update incident_comments set body=$1,edited_at=now() where id=$2",
      [body, commentId],
    );
  });
  return result;
}
export async function deleteComment(
  incidentId: string,
  commentId: string,
  userId: string,
) {
  const result = await query(
    "update incident_comments set body='[Deleted by author]',deleted_at=now() where id=$1 and incident_id=$2 and author_user_id=$3 and deleted_at is null",
    [commentId, incidentId, userId],
  );
  if (!result.rowCount)
    throw new AppError(404, "NOT_FOUND", "Comment not found.");
}
export async function verifyResolution(
  incidentId: string,
  userId: string,
  input: {
    verdict: "CONFIRM" | "DISPUTE";
    note?: string | undefined;
    evidenceId?: string | undefined;
    latitude?: number | undefined;
    longitude?: number | undefined;
  },
) {
  return transaction(async (db) => {
    const incident = await db.query<{
      official_status: string;
      longitude: number;
      latitude: number;
    }>(
      "select official_status,ST_X(location) longitude,ST_Y(location) latitude from incidents where id=$1 and public_visibility='PUBLIC' for update",
      [incidentId],
    );
    if (
      !incident.rows[0] ||
      !["RESOLUTION_SUBMITTED", "RESOLVED"].includes(
        incident.rows[0].official_status,
      )
    )
      throw new AppError(
        409,
        "RESOLUTION_NOT_OPEN",
        "This incident is not accepting resolution verification.",
      );
    let basis: string | undefined;
    let band: string | undefined;
    const connected = await db.query<{ basis: string }>(
      `select case when exists(select 1 from incident_reports ir join reports r on r.id=ir.report_id where ir.incident_id=$1 and r.reporter_user_id=$2) then 'REPORTER' when exists(select 1 from incident_evidence e where e.incident_id=$1 and e.uploader_user_id=$2) then 'EVIDENCE_CONTRIBUTOR' when exists(select 1 from affected_confirmations a where a.incident_id=$1 and a.user_id=$2 and a.created_at<(select min(created_at) from incident_status_history where incident_id=$1 and to_status='RESOLUTION_SUBMITTED')) then 'AFFECTED' end basis`,
      [incidentId, userId],
    );
    basis = connected.rows[0]?.basis;
    if (
      !basis &&
      input.latitude !== undefined &&
      input.longitude !== undefined
    ) {
      const distance = await db.query<{ meters: number }>(
        "select ST_Distance(location::geography,ST_SetSRID(ST_MakePoint($2,$3),4326)::geography) meters from incidents where id=$1",
        [incidentId, input.longitude, input.latitude],
      );
      const meters = Number(distance.rows[0]?.meters);
      if (meters <= 5000) {
        basis = "NEARBY";
        band =
          meters <= 500
            ? "WITHIN_500M"
            : meters <= 2000
              ? "WITHIN_2KM"
              : "WITHIN_5KM";
      }
    }
    if (!basis)
      throw new AppError(
        403,
        "VERIFICATION_NOT_ELIGIBLE",
        "Resolution verification is limited to connected or nearby citizens.",
      );
    if (input.verdict === "DISPUTE" && !input.note?.trim())
      throw new AppError(
        400,
        "DISPUTE_NOTE_REQUIRED",
        "Explain why the resolution is disputed.",
      );
    if (input.evidenceId) {
      const evidence = await db.query(
        "select 1 from incident_evidence where id=$1 and incident_id=$2 and uploader_user_id=$3",
        [input.evidenceId, incidentId, userId],
      );
      if (!evidence.rowCount)
        throw new AppError(
          400,
          "INVALID_EVIDENCE",
          "Dispute evidence was not found.",
        );
    }
    const verification = await db.query<{ id: string }>(
      `insert into resolution_verifications(incident_id,user_id,verdict,note,evidence_id,eligibility_basis,distance_band) values($1,$2,$3,$4,$5,$6,$7) on conflict(incident_id,user_id) do update set verdict=excluded.verdict,note=excluded.note,evidence_id=excluded.evidence_id,eligibility_basis=excluded.eligibility_basis,distance_band=excluded.distance_band,updated_at=now() returning id`,
      [
        incidentId,
        userId,
        input.verdict,
        input.note ?? null,
        input.evidenceId ?? null,
        basis,
        band ?? null,
      ],
    );
    const counts = await db.query<{
      confirms: number;
      disputes: number;
      evidence_disputes: number;
    }>(
      "select count(*) filter(where verdict='CONFIRM')::int confirms,count(*) filter(where verdict='DISPUTE')::int disputes,count(*) filter(where verdict='DISPUTE' and evidence_id is not null)::int evidence_disputes from resolution_verifications where incident_id=$1",
      [incidentId],
    );
    const c = counts.rows[0]!;
    const state = aggregateCommunityVerification({
      confirms: Number(c.confirms),
      disputes: Number(c.disputes),
      evidenceDisputes: Number(c.evidence_disputes),
    });
    await db.query(
      "update incidents set community_verification_status=$1,updated_at=now() where id=$2",
      [state, incidentId],
    );
    await db.query(
      "insert into incident_timeline_events(incident_id,event_type,actor_user_id,source_type,source_id,title,body,metadata) values($1,'COMMUNITY_VERIFICATION',$2,'RESOLUTION_VERIFICATION',$3,$4,$5,$6)",
      [
        incidentId,
        userId,
        verification.rows[0]!.id,
        state === "COMMUNITY_DISPUTED"
          ? "Community disputed the resolution"
          : "Community verification updated",
        input.note ?? null,
        JSON.stringify({ verdict: input.verdict, state }),
      ],
    );
    if (input.verdict === "DISPUTE") {
      await db.query(
        "insert into resolution_review_cases(incident_id,verification_id) values($1,$2) on conflict(verification_id) do nothing",
        [incidentId, verification.rows[0]!.id],
      );
      await db.query(
        `insert into notifications(user_id,type,payload)
         select distinct recipient,'RESOLUTION_DISPUTED',$2::jsonb from (
           select m.user_id recipient from incident_assignments ia join organization_members m on m.organization_id=ia.organization_id and m.membership_status='ACTIVE' where ia.incident_id=$1 and ia.role='PRIMARY' and ia.status='ACTIVE'
           union select id from users where platform_role='CIVICPULSE_ADMIN' and account_status='ACTIVE'
         ) recipients`,
        [
          incidentId,
          JSON.stringify({
            incidentId,
            verificationId: verification.rows[0]!.id,
          }),
        ],
      );
    }
    return { state };
  });
}
