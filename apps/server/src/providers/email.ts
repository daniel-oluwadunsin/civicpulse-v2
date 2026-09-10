import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";

const transport = env.smtpConfigured
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      requireTLS: env.SMTP_PORT !== 465,
      pool: true,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    })
  : undefined;

export async function verifyEmailProvider() {
  if (!transport)
    throw new AppError(
      503,
      "EMAIL_DELIVERY_UNAVAILABLE",
      "Email delivery is not configured.",
    );
  await transport.verify();
  return { configured: true, reachable: true };
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  text: string;
}) {
  if (!transport)
    throw new AppError(
      503,
      "EMAIL_DELIVERY_UNAVAILABLE",
      "Email delivery is not configured.",
    );
  await transport.sendMail({ from: env.EMAIL_FROM, ...input });
}
