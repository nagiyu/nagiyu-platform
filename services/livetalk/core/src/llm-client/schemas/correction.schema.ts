import { z } from 'zod';

/**
 * `correction-detector.ts` の `classifyWithLLM` 向け Structured Outputs スキーマ。
 *
 * @see Issue #3316
 */
export const CorrectionResponseSchema = z.object({
  detected: z.boolean(),
  targetMemoryIds: z.array(z.string()).nullable(),
  newValue: z.string().nullable(),
});

export type CorrectionResponseRaw = z.infer<typeof CorrectionResponseSchema>;
