import { z } from "zod";
import { LANGUAGE_CODES } from "@/lib/languages";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || undefined);

/**
 * Fields of POST /api/translate. `transcript` and `translation` let a retry
 * resume after the last successful step without paying for it again.
 */
export const translateRequestSchema = z
  .object({
    source: z.enum(LANGUAGE_CODES),
    target: z.enum(LANGUAGE_CODES),
    audio: z.instanceof(File).optional(),
    transcript: optionalText(4000),
    translation: optionalText(8000),
  })
  .refine((v) => v.source !== v.target, {
    message: "Customer and vendor languages must differ.",
  })
  .refine((v) => v.audio || v.transcript, {
    message: "No audio was provided.",
  });

export type TranslateRequest = z.infer<typeof translateRequestSchema>;

export const summaryRequestSchema = z.object({
  turns: z
    .array(
      z.object({
        role: z.enum(["customer", "vendor"]),
        source: z.enum(LANGUAGE_CODES),
        target: z.enum(LANGUAGE_CODES),
        transcript: z.string().trim().min(1).max(4000),
        translation: z.string().trim().max(8000).optional(),
      }),
    )
    .min(1, "There is nothing to summarise yet.")
    .max(40, "The conversation is too long to summarise."),
});

export type SummaryRequest = z.infer<typeof summaryRequestSchema>;
