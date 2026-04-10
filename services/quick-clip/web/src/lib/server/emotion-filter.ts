import type { EmotionFilter } from '@nagiyu/quick-clip-core';

export const VALID_EMOTION_FILTERS: ReadonlySet<string> = new Set<EmotionFilter>([
  'any',
  'laugh',
  'excite',
  'touch',
  'tension',
]);
