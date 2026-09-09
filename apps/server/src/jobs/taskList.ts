import { processReport } from "./tasks/processReport.js";
import { sendEmailTask } from "./tasks/sendEmail.js";
export const taskList = {
  "process-report": processReport,
  "send-email": sendEmailTask,
};
