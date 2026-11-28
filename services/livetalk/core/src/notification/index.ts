export {
  shouldNotifyNow,
  computeNextEarliestAt,
  resolveNotifyMessageSinceMs,
  extractSessionStartTimes,
  computeSessionIntervals,
  computeBaseIntervalMs,
  computeIntensityFactor,
  computeDailyNormalCap,
  resolveToneBucket,
  countTodayNotifications,
  median,
} from './decision.js';
export type { NotifyDecision, NotifyDecisionInput, ToneBucket } from './decision.js';

export {
  buildNotificationMessage,
  buildCriticalNotificationMessage,
  buildSuggestedReply,
} from './message-builder.js';
export type { BuildNotificationMessageInput, NotificationMessage } from './message-builder.js';

export { detectCriticalTopic } from './escalation.js';
export type {
  EscalationResult,
  SentCritical,
  DetectCriticalInput,
  DetectCriticalCandidate,
} from './escalation.js';

export { selectNotificationsToSend } from './selection.js';
export type { SelectNotificationsInput, SelectNotificationsResult } from './selection.js';

export {
  selectCriticalCandidateTopics,
  partitionCriticalCandidates,
  toSentCriticals,
} from './critical-candidates.js';
export type { PartitionedCriticalCandidates } from './critical-candidates.js';
