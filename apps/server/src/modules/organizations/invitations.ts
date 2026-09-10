import { createHash, randomBytes } from "node:crypto";
import { env } from "../../config/env.js";
import { sendEmail } from "../../providers/email.js";

export const invitationToken = () => randomBytes(32).toString("base64url");
export const invitationHash = (value: string) =>
  createHash("sha256")
    .update(`${env.SESSION_SECRET}:organization-invitation:${value}`)
    .digest("hex");

export async function sendOnboardingInvitation(input: {
  email: string;
  organizationName: string;
  kind: "GOVERNMENT" | "NGO";
  token: string;
}) {
  const url = `${env.APP_PUBLIC_URL}/organizations/onboard?token=${encodeURIComponent(input.token)}`;
  await sendEmail({
    to: input.email,
    subject: `Complete ${input.organizationName}'s CivicPulse onboarding`,
    text: `You have been invited to onboard ${input.organizationName} as a verified ${input.kind === "NGO" ? "NGO" : "government organization"}. This invitation expires in seven days. Continue securely: ${url}`,
  });
}

export async function sendMemberInvitation(input: {
  email: string;
  organizationName: string;
  token: string;
}) {
  const url = `${env.APP_PUBLIC_URL}/organization-invitation?token=${encodeURIComponent(input.token)}`;
  await sendEmail({
    to: input.email,
    subject: `Join ${input.organizationName} on CivicPulse`,
    text: `You have been invited to join ${input.organizationName} on CivicPulse. This invitation expires in seven days. Continue securely: ${url}`,
  });
}
