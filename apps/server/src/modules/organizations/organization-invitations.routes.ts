import { Router } from "express";
import { z } from "zod";
import { query, transaction } from "../../db/pool.js";
import { requireAuth } from "../../middleware/auth.js";
import { AppError } from "../../utils/errors.js";
import { invitationHash } from "./invitations.js";

const router = Router();
const tokenSchema = z.string().min(32).max(256);

router.get("/:token", async (req, res, next) => {
  try {
    const hash = invitationHash(tokenSchema.parse(req.params.token));
    const result = await query<{
      email: string;
      organization_kind: string;
      organization_name: string;
      status: string;
      expires_at: string;
      organization_id: string | null;
    }>(
      `select email,organization_kind,organization_name,
        case when status='PENDING' and expires_at<=now() then 'EXPIRED' else status end status,
        expires_at,organization_id
       from organization_onboarding_invitations where token_hash=$1`,
      [hash],
    );
    const invitation = result.rows[0];
    if (!invitation)
      throw new AppError(
        404,
        "INVITATION_NOT_FOUND",
        "This invitation is invalid.",
      );
    res.json({
      data: {
        email: invitation.email.replace(/(^.).*(@.*$)/, "$1•••$2"),
        kind: invitation.organization_kind,
        organizationName: invitation.organization_name,
        status: invitation.organization_id ? "COMPLETED" : invitation.status,
        expiresAt: invitation.expires_at,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/:token/accept", requireAuth, async (req, res, next) => {
  try {
    const hash = invitationHash(tokenSchema.parse(req.params.token));
    const result = await transaction(async (client) => {
      const invitation = await client.query<{
        id: string;
        email: string;
        status: string;
        expires_at: string;
        accepted_by: string | null;
        organization_id: string | null;
      }>(
        "select id,email,status,expires_at,accepted_by,organization_id from organization_onboarding_invitations where token_hash=$1 for update",
        [hash],
      );
      const item = invitation.rows[0];
      if (!item)
        throw new AppError(
          404,
          "INVITATION_NOT_FOUND",
          "This invitation is invalid.",
        );
      if (item.organization_id)
        throw new AppError(
          409,
          "INVITATION_USED",
          "This invitation has already been used.",
        );
      if (item.status === "ACCEPTED" && item.accepted_by === req.user!.id)
        return { accepted: true };
      if (item.status !== "PENDING" || new Date(item.expires_at) <= new Date())
        throw new AppError(
          410,
          "INVITATION_EXPIRED",
          "This invitation is no longer active.",
        );
      if (item.email.toLowerCase() !== req.user!.email.toLowerCase())
        throw new AppError(
          403,
          "INVITATION_EMAIL_MISMATCH",
          "Sign in with the email address that received this invitation.",
        );
      await client.query(
        "update organization_onboarding_invitations set status='ACCEPTED',accepted_by=$1,accepted_at=now(),updated_at=now() where id=$2",
        [req.user!.id, item.id],
      );
      return { accepted: true };
    });
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

router.post("/member/:token/accept", requireAuth, async (req, res, next) => {
  try {
    const hash = invitationHash(tokenSchema.parse(req.params.token));
    await transaction(async (client) => {
      const result = await client.query<{
        id: string;
        organization_id: string;
        email: string;
        role: string;
        status: string;
        expires_at: string;
      }>(
        "select id,organization_id,email,role,status,expires_at from organization_member_invitations where token_hash=$1 for update",
        [hash],
      );
      const item = result.rows[0];
      if (!item)
        throw new AppError(
          404,
          "INVITATION_NOT_FOUND",
          "This invitation is invalid.",
        );
      if (item.status !== "PENDING" || new Date(item.expires_at) <= new Date())
        throw new AppError(
          410,
          "INVITATION_EXPIRED",
          "This invitation is no longer active.",
        );
      if (item.email.toLowerCase() !== req.user!.email.toLowerCase())
        throw new AppError(
          403,
          "INVITATION_EMAIL_MISMATCH",
          "Sign in with the email address that received this invitation.",
        );
      await client.query(
        `insert into organization_members(organization_id,user_id,role,membership_status,invited_by,joined_at)
         select $1,$2,$3,'ACTIVE',invited_by,now() from organization_member_invitations where id=$4
         on conflict(organization_id,user_id) do update set role=excluded.role,membership_status='ACTIVE',joined_at=now()`,
        [item.organization_id, req.user!.id, item.role, item.id],
      );
      await client.query(
        "update organization_member_invitations set status='ACCEPTED',accepted_by=$1,accepted_at=now(),updated_at=now() where id=$2",
        [req.user!.id, item.id],
      );
    });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
