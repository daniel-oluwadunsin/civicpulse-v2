import cors from "cors";
import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env } from "./config/env.js";
import { pool } from "./db/pool.js";
import { errorHandler } from "./middleware/errors.js";
import { requestId } from "./middleware/request-id.js";
import authRoutes from "./modules/auth/auth.routes.js";
import organizationRoutes from "./modules/organizations/organizations.routes.js";
import reportRoutes from "./modules/reports/reports.routes.js";
import adminRoutes from "./modules/admin/admin.routes.js";
import incidentRoutes from "./modules/incidents/incidents.routes.js";
import governmentRoutes from "./modules/government/government.routes.js";
import interventionRoutes from "./modules/interventions/interventions.routes.js";
import moderationRoutes from "./modules/moderation/moderation.routes.js";
import followRoutes from "./modules/follows/follows.routes.js";
import publicRoutes from "./modules/public/public.routes.js";
import userRoutes from "./modules/users/users.routes.js";
import organizationInvitationRoutes from "./modules/organizations/organization-invitations.routes.js";
import { AppError } from "./utils/errors.js";
export function createApp() {
  const app = express();
  app.set("trust proxy", env.NODE_ENV === "production" ? 1 : false);
  app.use(
    requestId,
    helmet({ crossOriginResourcePolicy: false }),
    cors({ origin: env.WEB_ORIGIN, credentials: true }),
    express.json({ limit: "1mb" }),
    cookieParser(),
  );
  app.use((req, _res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const origin = req.get("origin");
    if (origin && origin !== env.WEB_ORIGIN)
      return next(
        new AppError(
          403,
          "INVALID_ORIGIN",
          "This request did not originate from the CivicPulse application.",
        ),
      );
    next();
  });
  app.use(
    rateLimit({
      windowMs: 15 * 60_000,
      limit: 100,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      skip: (req) => req.path === "/health",
    }),
  );
  app.get("/health", async (_req, res, next) => {
    try {
      await pool.query("select 1");
      res.json({ data: { status: "ok" } });
    } catch (error) {
      next(error);
    }
  });
  app.use("/api/v1/auth", authRoutes);
  app.use("/api/v1/organizations", organizationRoutes);
  app.use("/api/v1/organization-invitations", organizationInvitationRoutes);
  app.use("/api/v1/reports", reportRoutes);
  app.use("/api/v1/admin", adminRoutes);
  app.use("/api/v1/incidents", incidentRoutes);
  app.use("/api/v1/government", governmentRoutes);
  app.use("/api/v1/ngo", interventionRoutes);
  app.use("/api/v1/moderation", moderationRoutes);
  app.use("/api/v1/follows", followRoutes);
  app.use("/api/v1/public", publicRoutes);
  app.use("/api/v1/users", userRoutes);
  app.use(errorHandler);
  return app;
}
