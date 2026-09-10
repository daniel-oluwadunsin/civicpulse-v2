import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
declare global {
  namespace Express {
    interface Request {
      requestId: string;
      user?: {
        id: string;
        email: string;
        displayName?: string;
        platformRole: string | null;
      };
    }
  }
}
export const requestId: RequestHandler = (req, res, next) => {
  req.requestId = req.header("x-request-id") ?? randomUUID();
  res.setHeader("x-request-id", req.requestId);
  next();
};
