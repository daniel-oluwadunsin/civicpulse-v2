import { createHash } from "node:crypto";
import type { RequestHandler } from "express";
import { env } from "../config/env.js";
import { query } from "../db/pool.js";
import { AppError } from "../utils/errors.js";
const hash = (token: string) =>
  createHash("sha256").update(`${env.SESSION_SECRET}:${token}`).digest("hex");
export const sessionHash = hash;
export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const token = req.cookies?.[env.SESSION_COOKIE_NAME];
    if (!token) throw new AppError(401, "UNAUTHORIZED", "Sign in is required.");
    const result = await query<{
      id: string;
      email: string;
      display_name: string | null;
      platform_role: string | null;
    }>(
      `select u.id, u.email, u.display_name, u.platform_role from sessions s join users u on u.id=s.user_id where s.token_hash=$1 and s.expires_at > now() and s.revoked_at is null and u.account_status='ACTIVE'`,
      [hash(token)],
    );
    const user = result.rows[0];
    if (!user)
      throw new AppError(
        401,
        "UNAUTHORIZED",
        "Your session is invalid or expired.",
      );
    req.user = {
      id: user.id,
      email: user.email,
      ...(user.display_name ? { displayName: user.display_name } : {}),
      platformRole: user.platform_role,
    };
    next();
  } catch (error) {
    next(error);
  }
};
export const optionalAuth: RequestHandler = async (req, _res, next) => {
  const token = req.cookies?.[env.SESSION_COOKIE_NAME];
  if (!token) return next();
  try {
    const result = await query<{
      id: string;
      email: string;
      display_name: string | null;
      platform_role: string | null;
    }>(
      `select u.id,u.email,u.display_name,u.platform_role from sessions s join users u on u.id=s.user_id where s.token_hash=$1 and s.expires_at>now() and s.revoked_at is null and u.account_status='ACTIVE'`,
      [hash(token)],
    );
    const user = result.rows[0];
    if (user)
      req.user = {
        id: user.id,
        email: user.email,
        ...(user.display_name ? { displayName: user.display_name } : {}),
        platformRole: user.platform_role,
      };
  } catch {
    // Optional authentication must not make a public read unavailable.
  }
  next();
};
export const requirePlatformRole =
  (...roles: string[]): RequestHandler =>
  (req, _res, next) => {
    if (
      !req.user ||
      !req.user.platformRole ||
      !roles.includes(req.user.platformRole)
    )
      return next(
        new AppError(
          403,
          "FORBIDDEN",
          "You do not have platform permission for this action.",
        ),
      );
    next();
  };
export const requireOrganizationMember =
  (parameter = "organizationId"): RequestHandler =>
  async (req, _res, next) => {
    try {
      if (!req.user)
        throw new AppError(401, "UNAUTHORIZED", "Sign in is required.");
      const organizationId = req.params[parameter];
      const membership = await query(
        `select 1 from organization_members where organization_id=$1 and user_id=$2 and membership_status='ACTIVE'`,
        [organizationId, req.user.id],
      );
      if (!membership.rowCount)
        throw new AppError(
          403,
          "FORBIDDEN",
          "You are not an active member of this organization.",
        );
      next();
    } catch (error) {
      next(error);
    }
  };
