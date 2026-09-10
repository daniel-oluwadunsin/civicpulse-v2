import { z } from "zod";
import { AppError } from "./errors.js";

const cursorSchema = z.object({
  at: z.string().datetime(),
  id: z.string().uuid(),
  distance: z.number().nonnegative().optional(),
  score: z.number().optional(),
});
export type Cursor = z.infer<typeof cursorSchema>;
export function decodeCursor(value: unknown): Cursor | undefined {
  if (!value) return undefined;
  try {
    return cursorSchema.parse(
      JSON.parse(Buffer.from(String(value), "base64url").toString("utf8")),
    );
  } catch {
    throw new AppError(
      400,
      "INVALID_CURSOR",
      "The pagination cursor is invalid.",
    );
  }
}
export const encodeCursor = (value: Cursor) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
