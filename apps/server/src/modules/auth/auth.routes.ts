import { randomBytes, createHash } from "node:crypto";
import argon2 from "argon2";
import { Router, type Response } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { query, transaction } from "../../db/pool.js";
import { requireAuth, sessionHash } from "../../middleware/auth.js";
import { databaseRateLimit } from "../../middleware/database-rate-limit.js";
import { sendEmail } from "../../providers/email.js";
import { AppError } from "../../utils/errors.js";
const router = Router();
const tokenHash = (token: string) =>
  createHash("sha256").update(`${env.SESSION_SECRET}:${token}`).digest("hex");
const token = () => randomBytes(32).toString("base64url");
function cookie(res: Response, raw: string) {
  res.cookie(env.SESSION_COOKIE_NAME, raw, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: env.SESSION_TTL_DAYS * 86400_000,
    path: "/",
  });
}
async function createSession(userId: string) {
  const raw = token();
  await query(
    "insert into sessions(user_id, token_hash, expires_at) values($1,$2,now() + ($3 || ' days')::interval)",
    [userId, sessionHash(raw), String(env.SESSION_TTL_DAYS)],
  );
  return raw;
}
router.post(
  "/register",
  databaseRateLimit("auth-register", 5, 900),
  async (req, res, next) => {
    try {
      const input = z
        .object({
          email: z
            .string()
            .email()
            .transform((value) => value.toLowerCase()),
          password: z.string().min(12).max(128),
          displayName: z.string().min(2).max(100),
        })
        .parse(req.body);
      const passwordHash = await argon2.hash(input.password, {
        type: argon2.argon2id,
      });
      const user = await transaction(async (client) => {
        const result = await client.query<{ id: string }>(
          "insert into users(email,password_hash,display_name) values($1,$2,$3) returning id",
          [input.email, passwordHash, input.displayName],
        );
        const raw = token();
        await client.query(
          "insert into verification_tokens(user_id,token_hash,expires_at) values($1,$2,now()+interval '24 hours')",
          [result.rows[0]!.id, tokenHash(raw)],
        );
        return { id: result.rows[0]!.id, raw };
      });
      let delivery = "SENT";
      try {
        await sendEmail({
          to: input.email,
          subject: "Verify your CivicPulse email",
          text: `Verify your account: ${env.APP_PUBLIC_URL}/verify-email?token=${user.raw}`,
        });
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        delivery = "PENDING_CONFIGURATION";
      }
      const rawSession = await createSession(user.id);
      cookie(res, rawSession);
      res
        .status(201)
        .json({ data: { userId: user.id, verificationDelivery: delivery } });
    } catch (error) {
      if ((error as { code?: string })?.code === "23505")
        return next(
          new AppError(
            409,
            "EMAIL_ALREADY_REGISTERED",
            "An account already exists for this email address.",
          ),
        );
      next(error);
    }
  },
);
router.post(
  "/login",
  databaseRateLimit("auth-login", 10, 900),
  async (req, res, next) => {
    try {
      const input = z
        .object({
          email: z
            .string()
            .email()
            .transform((value) => value.toLowerCase()),
          password: z.string().min(1),
        })
        .parse(req.body);
      const result = await query<{
        id: string;
        password_hash: string;
        account_status: string;
      }>("select id,password_hash,account_status from users where email=$1", [
        input.email,
      ]);
      const user = result.rows[0];
      if (!user || !(await argon2.verify(user.password_hash, input.password)))
        throw new AppError(
          401,
          "INVALID_CREDENTIALS",
          "Email or password is incorrect.",
        );
      if (user.account_status !== "ACTIVE")
        throw new AppError(
          403,
          "ACCOUNT_DISABLED",
          "This account is disabled. Contact CivicPulse support if this is unexpected.",
        );
      cookie(res, await createSession(user.id));
      res.json({ data: { authenticated: true } });
    } catch (error) {
      next(error);
    }
  },
);
router.post("/logout", async (req, res, next) => {
  try {
    const raw = req.cookies?.[env.SESSION_COOKIE_NAME];
    if (raw)
      await query("update sessions set revoked_at=now() where token_hash=$1", [
        sessionHash(raw),
      ]);
    res.clearCookie(env.SESSION_COOKIE_NAME, {
      path: "/",
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
    });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});
router.post("/logout-all", requireAuth, async (req, res, next) => {
  try {
    await query("update sessions set revoked_at=now() where user_id=$1", [
      req.user!.id,
    ]);
    res.clearCookie(env.SESSION_COOKIE_NAME, {
      path: "/",
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
    });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});
router.get("/me", requireAuth, async (req, res) => {
  const organizations = await query(
    "select o.id,o.kind,o.display_name,o.official_name,o.active,o.verification_status,o.onboarding_status,m.role from organization_members m join organizations o on o.id=m.organization_id where m.user_id=$1 and m.membership_status='ACTIVE'",
    [req.user!.id],
  );
  res.json({ data: { user: req.user, organizations: organizations.rows } });
});
router.post("/verify-email", async (req, res, next) => {
  try {
    const input = z.object({ token: z.string().min(20) }).parse(req.body);
    const result = await query<{ user_id: string }>(
      "update verification_tokens set consumed_at=now() where token_hash=$1 and consumed_at is null and expires_at>now() returning user_id",
      [tokenHash(input.token)],
    );
    if (!result.rowCount)
      throw new AppError(
        400,
        "INVALID_TOKEN",
        "Verification link is invalid or expired.",
      );
    await query(
      "update users set email_verified_at=now(),updated_at=now() where id=$1",
      [result.rows[0]!.user_id],
    );
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});
router.post(
  "/forgot-password",
  databaseRateLimit("auth-recovery", 5, 900),
  async (req, res, next) => {
    try {
      const input = z
        .object({
          email: z
            .string()
            .email()
            .transform((value) => value.toLowerCase()),
        })
        .parse(req.body);
      const result = await query<{ id: string }>(
        "select id from users where email=$1 and account_status='ACTIVE'",
        [input.email],
      );
      if (result.rowCount) {
        const raw = token();
        await query(
          "insert into password_reset_tokens(user_id,token_hash,expires_at) values($1,$2,now()+interval '1 hour')",
          [result.rows[0]!.id, tokenHash(raw)],
        );
        await sendEmail({
          to: input.email,
          subject: "Reset your CivicPulse password",
          text: `Reset your password: ${env.APP_PUBLIC_URL}/reset-password?token=${raw}`,
        });
      }
      res.status(202).json({ data: { accepted: true } });
    } catch (error) {
      next(error);
    }
  },
);
router.post(
  "/reset-password",
  databaseRateLimit("auth-reset", 5, 900),
  async (req, res, next) => {
    try {
      const input = z
        .object({
          token: z.string().min(20),
          password: z.string().min(12).max(128),
        })
        .parse(req.body);
      const reset = await query<{ user_id: string }>(
        "update password_reset_tokens set consumed_at=now() where token_hash=$1 and consumed_at is null and expires_at>now() returning user_id",
        [tokenHash(input.token)],
      );
      if (!reset.rowCount)
        throw new AppError(
          400,
          "INVALID_TOKEN",
          "Password reset link is invalid or expired.",
        );
      const passwordHash = await argon2.hash(input.password, {
        type: argon2.argon2id,
      });
      await transaction(async (client) => {
        await client.query(
          "update users set password_hash=$1,updated_at=now() where id=$2",
          [passwordHash, reset.rows[0]!.user_id],
        );
        await client.query(
          "update sessions set revoked_at=now() where user_id=$1",
          [reset.rows[0]!.user_id],
        );
      });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  },
);
export default router;
