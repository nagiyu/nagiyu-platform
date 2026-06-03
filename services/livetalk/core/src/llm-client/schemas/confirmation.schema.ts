import { z } from 'zod';

/**
 * `confirmation.ts` の `judgePromotionsWithLLM` 向け Structured Outputs スキーマ。
 *
 * @see Issue #3316
 */
export const ConfirmationResponseSchema = z.object({
  promotions: z.array(
    z.object({
      memoryId: z.string(),
      promote: z.boolean(),
    })
  ),
});

export type ConfirmationResponseRaw = z.infer<typeof ConfirmationResponseSchema>;
