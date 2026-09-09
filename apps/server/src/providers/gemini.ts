import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";
let cursor = 0;
const isRateLimited = (error: unknown) =>
  /429|resource_exhausted|rate.?limit/i.test(
    error instanceof Error ? error.message : String(error),
  );
export async function withGemini<T>(
  model: string | undefined,
  run: (client: GoogleGenAI, model: string) => Promise<T>,
) {
  if (!model || env.geminiKeys.length === 0)
    throw new AppError(
      503,
      "AI_PROCESSING_UNAVAILABLE",
      "Gemini processing is not configured.",
    );
  let lastError: unknown;
  for (let attempt = 0; attempt < env.geminiKeys.length; attempt += 1) {
    const key = env.geminiKeys[(cursor + attempt) % env.geminiKeys.length]!;
    try {
      const result = await run(new GoogleGenAI({ apiKey: key }), model);
      cursor = (cursor + attempt) % env.geminiKeys.length;
      return result;
    } catch (error) {
      lastError = error;
      if (!isRateLimited(error)) throw error;
    }
  }
  throw new AppError(
    503,
    "AI_RATE_LIMITED",
    "All configured Gemini keys are currently rate-limited.",
    lastError instanceof Error ? { message: lastError.message } : undefined,
  );
}
