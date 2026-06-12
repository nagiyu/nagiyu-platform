export {
  shouldNotifyNow,
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

export { buildNotificationMessage, buildCriticalNotificationMessage, buildSuggestedReply } from './message-builder.js';
export type { BuildNotificationMessageInput, NotificationMessage } from './message-builder.js';

export { detectCriticalKnowledge } from './escalation.js';
export type { EscalationResult, DetectCriticalInput } from './escalation.js';

export { selectNotificationsToSend } from './selection.js';
export type { SelectNotificationsInput, SelectNotificationsResult } from './selection.js';
