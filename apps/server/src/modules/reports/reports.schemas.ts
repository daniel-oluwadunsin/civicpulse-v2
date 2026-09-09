import { z } from "zod";
export const reportAnalysisSchema = z.object({
  hasCivicIssue: z.boolean(),
  detectedLanguage: z.string().min(1),
  languageConfidence: z.number().min(0).max(1).optional(),
  originalTranscript: z.string().nullable().optional(),
  englishTranscript: z.string().nullable().optional(),
  title: z.string().min(3).max(180),
  summary: z.string().min(3).max(1000),
  fullDescription: z.string().min(3).max(6000),
  category: z.enum([
    "ROADS",
    "DRAINAGE",
    "WATER",
    "WASTE",
    "POWER",
    "EDUCATION",
    "HEALTH",
    "PUBLIC_BUILDING",
    "OTHER",
  ]),
  subcategory: z.string().max(100).nullable().optional(),
  affectedAssets: z.array(z.string()).max(20),
  observations: z.array(z.string()).max(30),
  urgencySignals: z.array(z.string()).max(20),
  locationMentions: z.array(z.string()).max(20),
});
export type ReportAnalysis = z.infer<typeof reportAnalysisSchema>;
