import type { Task } from "graphile-worker";

export const cleanupRateLimits: Task = async (_payload, helpers) => {
  await helpers.query(
    "delete from rate_limit_events where window_started_at < now() - interval '2 days'",
  );
};
