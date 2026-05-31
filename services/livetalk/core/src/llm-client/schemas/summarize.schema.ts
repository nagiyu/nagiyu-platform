import { z } from 'zod';

/**
 * `ILLMClient.summarize` の Structured Outputs 用 Zod スキーマ。
 *
 * OpenAI strict モードの制約により、optional フィールドは `nullable()` で表現する。
 * `interestCategories` / `bidirectionalityScore` は未取得時に null を返すことを許容。
 *
 * @see Issue #3316
 */
export const SummarizeResultSchema = z.object({
  mergedSummary: z.string(),
  newMemoryCandidates: z.array(
    z.object({
      category: z.string(),
      content: z.string(),
    })
  ),
  interestCategories: z
    .array(
      z.object({
        category: z.string(),
        weight: z.number(),
      })
    )
    .nullable(),
  bidirectionalityScore: z.number().nullable(),
});

export type SummarizeResultRaw = z.infer<typeof SummarizeResultSchema>;
