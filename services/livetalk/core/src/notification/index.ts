export {
  shouldNotifyNow,
  extractSessionStartTimes,
  computeSessionIntervals,
  computeBaseIntervalMs,
  resolveToneBucket,
  countTodayNotifications,
  median,
} from './decision.js';
export type { NotifyDecision, NotifyDecisionInput, ToneBucket } from './decision.js';

export {
  buildNotificationMessage,
  buildCriticalNotificationMessage,
} from './message-builder.js';
export type { BuildNotificationMessageInput, NotificationMessage } from './message-builder.js';

export { detectCriticalKnowledge } from './escalation.js';
export type { EscalationResult } from './escalation.js';
