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
  app.use("/api/v1/reports", reportRoutes);
  app.use("/api/v1/admin", adminRoutes);
  app.use(errorHandler);
  return app;
}
