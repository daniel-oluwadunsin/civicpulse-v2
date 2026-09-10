import type { RequestHandler } from "express";
import { query } from "../db/pool.js";
import { AppError } from "../utils/errors.js";
export const databaseRateLimit =
  (bucket: string, limit: number, windowSeconds = 60): RequestHandler =>
  async (req, _res, next) => {
    try {
      const email =
        typeof req.body?.email === "string"
          ? req.body.email.trim().toLowerCase()
          : undefined;
      const subject =
        req.user?.id ??
        (bucket.startsWith("auth-") && email
          ? `${req.ip ?? "unknown"}:${email}`
          : (req.ip ?? "unknown"));
      const row = await query<{ hits: number }>(
        `insert into rate_limit_events(bucket,subject,window_started_at) values($1,$2,to_timestamp(floor(extract(epoch from now())/$3)*$3)) on conflict(bucket,subject,window_started_at) do update set hits=rate_limit_events.hits+1 returning hits`,
        [bucket, subject, windowSeconds],
      );
      if (Number(row.rows[0]?.hits) > limit)
        throw new AppError(
          429,
          "RATE_LIMITED",
          "Please wait before trying again.",
        );
      next();
    } catch (e) {
      next(e);
    }
  };
