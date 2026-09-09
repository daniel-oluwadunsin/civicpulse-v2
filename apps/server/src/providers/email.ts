import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";
export async function sendEmail(input: {
  to: string;
  subject: string;
  text: string;
}) {
  if (!env.smtpConfigured)
    throw new AppError(
      503,
      "EMAIL_DELIVERY_UNAVAILABLE",
      "Email delivery is not configured.",
    );
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  await transport.sendMail({ from: env.EMAIL_FROM, ...input });
}
