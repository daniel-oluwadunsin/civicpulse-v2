import { processReport } from "./tasks/processReport.js";
import { sendEmailTask } from "./tasks/sendEmail.js";
import { cleanupRateLimits } from "./tasks/cleanupRateLimits.js";
export const taskList = {
  "process-report": processReport,
  "send-email": sendEmailTask,
  "cleanup-rate-limits": cleanupRateLimits,
};
