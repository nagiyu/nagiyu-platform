/**
 * セーフティモジュール（Phase 2d / Issue #3250）。
 */

export type {
  SafetyCategory,
  SafetyTrigger,
  SafetyDetection,
  ModerationResult,
  SafetyResource,
  IModerationClient,
} from './types.js';

export { KEYWORD_PATTERNS, EXCLUSION_PATTERNS, shouldExclude } from './keywords.js';

export { detectSafetyRisk } from './detector.js';

export { SAFETY_RESOURCES } from './resources.js';

export {
  buildSafetyMessage,
  buildModerationReplacementMessage,
  MODERATION_REPLACEMENT_MESSAGES,
} from './templates.js';

export {
  OpenAIModerationClient,
  NoOpModerationClient,
  MODERATION_ERROR_MESSAGES,
  type OpenAIModerationClientOptions,
} from './moderation.js';
