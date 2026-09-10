import type { PoolClient } from "pg";
import { AppError } from "../utils/errors.js";

export const mentionTargetTypes = [
  "REPORT",
  "COMMENT",
  "OFFICIAL_UPDATE",
  "ROUTING_REVIEW",
  "INTERVENTION_PROPOSAL",
  "MILESTONE",
  "INSPECTION",
  "RESOLUTION",
  "HANDOVER",
] as const;
export async function recordOrganizationMentions(
  client: PoolClient,
  input: {
    organizationIds: string[];
    actorUserId: string;
    targetType: (typeof mentionTargetTypes)[number];
    targetId: string;
    preview: string;
  },
) {
  const ids = [...new Set(input.organizationIds)];
  if (ids.length > 5)
    throw new AppError(
      400,
      "MENTION_LIMIT",
      "No more than five organizations may be mentioned in one item.",
    );
  if (!ids.length) return;
  const valid = await client.query<{ id: string }>(
    "select id from organizations where id=any($1::uuid[]) and active=true and verification_status in ('VERIFIED','APPROVED')",
    [ids],
  );
  if (valid.rowCount !== ids.length)
    throw new AppError(
      400,
      "INVALID_MENTION",
      "Only verified active organizations can be mentioned.",
    );
  for (const row of valid.rows) {
    const mention = await client.query<{ id: string }>(
      "insert into organization_mentions(organization_id,actor_user_id,target_type,target_id) values($1,$2,$3,$4) on conflict do nothing returning id",
      [row.id, input.actorUserId, input.targetType, input.targetId],
    );
    if (!mention.rowCount) continue;
    await client.query(
      `insert into notifications(user_id,type,payload) select om.user_id,'ORGANIZATION_MENTION',$2::jsonb from organization_members om join users u on u.id=om.user_id where om.organization_id=$1 and om.membership_status='ACTIVE' and coalesce((u.notification_preferences->>'mentions')::boolean,true)`,
      [
        row.id,
        JSON.stringify({
          mentionId: mention.rows[0]!.id,
          targetType: input.targetType,
          targetId: input.targetId,
          preview: input.preview.slice(0, 180),
        }),
      ],
    );
  }
}
