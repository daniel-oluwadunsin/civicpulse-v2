import type { PoolClient } from "pg";
import { query } from "../db/pool.js";
import { AppError } from "../utils/errors.js";

export type Membership = {
  organizationId: string;
  organizationKind: "GOVERNMENT" | "NGO";
  role: "MEMBER" | "OFFICER" | "MANAGER" | "ORG_ADMIN";
};

export async function requireMembership(
  userId: string,
  organizationId: string,
  kind: Membership["organizationKind"],
  roles: Membership["role"][],
  db?: PoolClient,
) {
  const text = `select m.organization_id "organizationId",o.kind "organizationKind",m.role,o.active,o.verification_status
     from organization_members m join organizations o on o.id=m.organization_id
     where m.user_id=$1 and m.organization_id=$2 and m.membership_status='ACTIVE'`;
  const result = db
    ? await db.query<
        Membership & { active: boolean; verification_status: string }
      >(text, [userId, organizationId])
    : await query<
        Membership & { active: boolean; verification_status: string }
      >(text, [userId, organizationId]);
  const member = result.rows[0];
  if (
    !member ||
    member.organizationKind !== kind ||
    !member.active ||
    member.verification_status !== "VERIFIED" ||
    !roles.includes(member.role)
  )
    throw new AppError(
      403,
      "FORBIDDEN",
      "Your verified organization role does not permit this action.",
    );
  return member;
}

export async function requireAssignedGovernment(
  userId: string,
  organizationId: string,
  incidentId: string,
  roles: Membership["role"][],
  primaryOnly = false,
  db?: PoolClient,
) {
  const member = await requireMembership(
    userId,
    organizationId,
    "GOVERNMENT",
    roles,
    db,
  );
  const text = `select role from incident_assignments where incident_id=$1 and organization_id=$2 and status='ACTIVE'`;
  const assignment = db
    ? await db.query<{ role: "PRIMARY" | "SUPPORTING" }>(text, [
        incidentId,
        organizationId,
      ])
    : await query<{ role: "PRIMARY" | "SUPPORTING" }>(text, [
        incidentId,
        organizationId,
      ]);
  if (
    !assignment.rows[0] ||
    (primaryOnly && assignment.rows[0].role !== "PRIMARY")
  )
    throw new AppError(
      403,
      "FORBIDDEN",
      primaryOnly
        ? "Only the primary assigned organization may perform this action."
        : "This incident is not assigned to your organization.",
    );
  return { member, assignment: assignment.rows[0] };
}
