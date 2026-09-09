import type { Task } from "graphile-worker";
import { sendEmail } from "../../providers/email.js";
export const sendEmailTask: Task = async (payload) => {
  const item = payload as { to: string; subject: string; text: string };
  await sendEmail(item);
};
