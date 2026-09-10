import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { z } from "zod";

dotenv.config({
  path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../../.env"),
});

const optional = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined);
const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  WEB_ORIGIN: z.string().url(),
  APP_PUBLIC_URL: z.string().url(),
  API_PUBLIC_URL: z.string().url(),
  SESSION_COOKIE_NAME: z.string().default("civicpulse_session"),
  SESSION_SECRET: z.string().min(24),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  CLOUDINARY_CLOUD_NAME: optional,
  CLOUDINARY_API_KEY: optional,
  CLOUDINARY_API_SECRET: optional,
  CLOUDINARY_EVIDENCE_FOLDER: z.string().default("civicpulse/evidence"),
  GEMINI_MODEL_REPORT_ANALYSIS: optional,
  GEMINI_MODEL_MATCHING: optional,
  GEMINI_MODEL_ROUTING: optional,
  SMTP_HOST: optional,
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: optional,
  SMTP_PASS: optional,
  EMAIL_FROM: optional,
  GEOAPIFY_API_KEY: optional,
});

const parsed = schema.parse(process.env);
if (
  parsed.NODE_ENV === "production" &&
  (parsed.SESSION_SECRET.includes("replace-with") ||
    parsed.APP_PUBLIC_URL.startsWith("http://") ||
    parsed.API_PUBLIC_URL.startsWith("http://"))
) {
  throw new Error(
    "Production requires a non-placeholder session secret and HTTPS public URLs.",
  );
}
const smtpValues = [
  parsed.SMTP_HOST,
  parsed.SMTP_USER,
  parsed.SMTP_PASS,
  parsed.EMAIL_FROM,
];
if (smtpValues.some(Boolean) && !smtpValues.every(Boolean)) {
  throw new Error(
    "SMTP_HOST, SMTP_USER, SMTP_PASS, and EMAIL_FROM must be configured together.",
  );
}
const geminiKeys = Object.entries(process.env)
  .filter(([key, value]) => /^GEMINI_API_KEY_\d+$/.test(key) && value?.trim())
  .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
  .map(([, value]) => value!.trim());

export const env = {
  ...parsed,
  geminiKeys,
  smtpConfigured: Boolean(
    parsed.SMTP_HOST &&
    parsed.SMTP_USER &&
    parsed.SMTP_PASS &&
    parsed.EMAIL_FROM,
  ),
  cloudinaryConfigured: Boolean(
    parsed.CLOUDINARY_CLOUD_NAME &&
    parsed.CLOUDINARY_API_KEY &&
    parsed.CLOUDINARY_API_SECRET,
  ),
};
