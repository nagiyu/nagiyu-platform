// TTS プロバイダ非依存ポート（IVoiceClient / VoiceConfig）
export * from './voice/index.js';
export * from './voicevox/index.js';
export * from './openai-voice/index.js';
export * from './llm-client/index.js';
export * from './constants.js';

// Affection
export type { AffectionFactors } from './affection/index.js';
export {
  calculateAffectionDelta,
  calculateBidirectionalityDelta,
  updateAffectionLevel,
  isNewActiveDay,
} from './affection/index.js';

// Memory embedding（cosine similarity。consolidate・Topic 想起が使用）
export { cosineSimilarity } from './memory/index.js';

// Safety
export * from './safety/index.js';

// Characters
export * from './characters/index.js';

// Sentence splitter
export { SentenceBuffer } from './lib/sentence-splitter.js';

// Observability
export {
  createPhaseTimer,
  buildEmfPayload,
  createChatMetrics,
  emitChatMetricsLog,
  emitChatMetricsEMF,
  emitBatchMetricsLog,
  emitBatchMetricsEMF,
} from './observability/index.js';
export type {
  PhaseTimer,
  EmfUnit,
  EmfMetricDefinition,
  EmfPayloadOptions,
  ChatMetrics,
  BatchMetrics,
} from './observability/index.js';

// Lifecycle
export {
  resolveLifecycleState,
  buildHourlyHistogram,
  findPeakInRange,
  adaptCharacterSchedule,
  parseTimeToMinutes,
  formatMinutesToTime,
  smoothTime,
  clampTime,
} from './lifecycle/index.js';
export type { HourHistogram, AdaptationOptions } from './lifecycle/index.js';
export type {
  LifecycleEntity,
  LifecycleKey,
  LifecycleState,
  CreateLifecycleInput,
  UpdateLifecycleInput,
  UserActivityProfile,
} from './entities/lifecycle.entity.js';
export type { LifecycleRepository } from './repositories/lifecycle.repository.interface.js';
export { InMemoryLifecycleRepository } from './repositories/in-memory-lifecycle.repository.js';
export { DynamoDBLifecycleRepository } from './repositories/dynamodb-lifecycle.repository.js';
export { LifecycleMapper } from './mappers/lifecycle.mapper.js';

// Chat usecase
export { runChatUseCase, type ChatEvent, type ChatUseCaseParams } from './usecases/chat-usecase.js';

// Learn user activity usecase
export {
  learnUserActivity,
  type LearnUserActivityParams,
} from './usecases/learn-user-activity.usecase.js';

// Research（Phase 5a）
export type { IResearchClient, ResearchResult } from './research/index.js';
export {
  OpenAIResearchClient,
  RESEARCH_ERROR_MESSAGES,
  type OpenAIResearchClientOptions,
} from './research/index.js';

// WEB fact 変化検知（リブトーク知識再設計 P3 / #3699、acquire バッチ用）
export { LLMWebFactChangeDetector, type IWebFactChangeDetector } from './research/index.js';
export { WebFactChangeSchema } from './llm-client/schemas/web-fact-change.schema.js';
export type { WebFactChangeRaw } from './llm-client/schemas/web-fact-change.schema.js';

// Entities
export type { MessageEntity, MessageKey, CreateMessageInput } from './entities/message.entity.js';
export type {
  SafetyEventEntity,
  SafetyEventKey,
  CreateSafetyEventInput,
  SafetyEventSummary,
} from './entities/safety-event.entity.js';
export type {
  ProfileEntity,
  ProfileKey,
  CreateProfileInput,
  UpdateProfileInput,
} from './entities/profile.entity.js';
export type {
  CharacterStateEntity,
  CharacterStateKey,
  CreateCharacterStateInput,
  UpdateCharacterStateInput,
} from './entities/character-state.entity.js';

// Mappers
export { MessageMapper } from './mappers/message.mapper.js';
export { ProfileMapper } from './mappers/profile.mapper.js';
export { CharacterStateMapper } from './mappers/character-state.mapper.js';
export { SafetyEventMapper } from './mappers/safety-event.mapper.js';
export {
  buildUserPK,
  buildProfileSK,
  buildCharacterStateSK,
  buildMessageSK,
  buildMessageSKPrefix,
  buildSafetyEventSK,
  buildSafetyEventSKPrefix,
  buildLifecycleSK,
  // GSI1: Profile 列挙用 sparse GSI（#3527）
  PROFILE_GSI_INDEX_NAME,
  buildProfileGSI1PK,
  // GSI2: SafetyEvent 横断レビュー用 sparse GSI（ADR-2.22 / #3580）
  SAFETY_EVENT_GSI_INDEX_NAME,
  buildSafetyEventGSI2PK,
} from './mappers/keys.js';

// Repository interfaces
export type {
  MessageRepository,
  GetRecentByTokenBudgetOptions,
  RecentMessagesResult,
} from './repositories/message.repository.interface.js';
export type { ProfileRepository } from './repositories/profile.repository.interface.js';
export type { CharacterStateRepository } from './repositories/character-state.repository.interface.js';
export type { SafetyEventRepository } from './repositories/safety-event.repository.interface.js';

// Repository implementations
export { DynamoDBMessageRepository } from './repositories/dynamodb-message.repository.js';
export { DynamoDBProfileRepository } from './repositories/dynamodb-profile.repository.js';
export { DynamoDBCharacterStateRepository } from './repositories/dynamodb-character-state.repository.js';
export { DynamoDBSafetyEventRepository } from './repositories/dynamodb-safety-event.repository.js';
export { InMemoryMessageRepository } from './repositories/in-memory-message.repository.js';
export { InMemoryProfileRepository } from './repositories/in-memory-profile.repository.js';
export { InMemoryCharacterStateRepository } from './repositories/in-memory-character-state.repository.js';
export { InMemorySafetyEventRepository } from './repositories/in-memory-safety-event.repository.js';

// StudyTopic（Phase 5b / #3344）
export type {
  StudyTopicEntity,
  StudyTopicKey,
  CreateStudyTopicInput,
  UpdateStudyTopicInput,
} from './entities/study-topic.entity.js';
export type { StudyTopicRepository } from './repositories/study-topic.repository.interface.js';
export { InMemoryStudyTopicRepository } from './repositories/in-memory-study-topic.repository.js';
export { DynamoDBStudyTopicRepository } from './repositories/dynamodb-study-topic.repository.js';
export { StudyTopicMapper } from './mappers/study-topic.mapper.js';
export { buildStudyTopicSK, buildStudyTopicSKPrefix } from './mappers/keys.js';

// Note（Phase 5c / #3345）
export type { NoteEntity, NoteKey, CreateNoteInput } from './entities/note.entity.js';
export type { NoteRepository } from './repositories/note.repository.interface.js';
export { InMemoryNoteRepository } from './repositories/in-memory-note.repository.js';
export { DynamoDBNoteRepository } from './repositories/dynamodb-note.repository.js';
export { NoteMapper } from './mappers/note.mapper.js';
export { buildNoteSK, buildNoteSKPrefix } from './mappers/keys.js';
export {
  generateNotesForUser,
  type GenerateNotesParams,
  type GenerateNotesResult,
} from './usecases/generate-note.usecase.js';
export {
  buildGenerateNotePrompt,
  type GenerateNotePromptInput,
  type GenerateNotePromptSelfFact,
  type GenerateNotePromptWebFact,
} from './usecases/generate-note.prompt.js';
export { NoteLetterSchema, type NoteLetterRaw } from './llm-client/schemas/note-letter.schema.js';

// 知識ゲート（Phase 5b / #3344。P5 で searchKnowledge/evaluateKnowledgeGate/KnowledgeMatcher は撤去、classifyTopic のみ残置）
export { classifyTopic } from './study/knowledge-gate.js';
export { buildStudyDeferralMessage } from './study/templates.js';

// Token counter
export {
  TiktokenCounter,
  getDefaultTokenCounter,
  resolveContextTokenLimit,
  setTokenCounterForTesting,
  type TokenCounter,
} from './lib/token-counter.js';

// ULID factory（テストで差し替え可能にしておく）
export { defaultUlidFactory, type UlidFactory } from './lib/ulid.js';

// Consent
export { isConsentValid, type ConsentRequirements } from './lib/consent.js';
export type { ConsentRecord, AgeVerification, UserConsents } from './entities/profile.entity.js';
export {
  LIVETALK_TERMS_VERSION,
  LIVETALK_PRIVACY_VERSION,
  AFFECTION_INFO_DISCLOSURE_WEIGHT,
  AFFECTION_TIME_CONTINUITY_BONUS,
  AFFECTION_BIDIRECTIONALITY_WEIGHT,
  STUDY_INACTIVE_WINDOW_HOURS,
  STUDY_TOPIC_TTL_SECONDS,
  STUDY_TOPIC_GATE_PRIORITY,
  NOTE_CARE_THRESHOLD,
  NOTE_MAX_PER_RUN,
  NOTE_CANDIDATE_LOOKBACK,
  NOTE_RECENT_DAYS,
  NOTE_RECENT_LIMIT,
} from './constants.js';

// acquire usecase（リブトーク知識再設計 P3 / #3699）
export {
  acquireForUser,
  shouldAcquireNow,
  type AcquireForUserParams,
  type AcquireForUserResult,
} from './usecases/acquire.usecase.js';
export { ACQUIRE_MAX_QUERIES_PER_RUN, ACQUIRE_STALE_SWEEP_LIMIT } from './constants.js';

// PushSubscription（Phase 5d / #3346）
export type {
  PushSubscriptionEntity,
  PushSubscriptionKey,
  CreatePushSubscriptionInput,
} from './entities/push-subscription.entity.js';
export type { PushSubscriptionRepository } from './repositories/push-subscription.repository.interface.js';
export { InMemoryPushSubscriptionRepository } from './repositories/in-memory-push-subscription.repository.js';
export { DynamoDBPushSubscriptionRepository } from './repositories/dynamodb-push-subscription.repository.js';
export { PushSubscriptionMapper } from './mappers/push-subscription.mapper.js';
export { buildPushSubscriptionSK, buildPushSubscriptionSKPrefix } from './mappers/keys.js';

// NotificationEvent（Phase 5d / #3346）
export type {
  NotificationEventEntity,
  NotificationEventKey,
  CreateNotificationEventInput,
} from './entities/notification-event.entity.js';
export type { NotificationEventRepository } from './repositories/notification-event.repository.interface.js';
export { InMemoryNotificationEventRepository } from './repositories/in-memory-notification-event.repository.js';
export { DynamoDBNotificationEventRepository } from './repositories/dynamodb-notification-event.repository.js';
export { NotificationEventMapper } from './mappers/notification-event.mapper.js';
export { buildNotifSK, buildNotifSKPrefix } from './mappers/keys.js';

// Notification logic（Phase 5d / #3346）
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
} from './notification/index.js';
export type { NotifyDecision, NotifyDecisionInput, ToneBucket } from './notification/index.js';
export {
  buildNotificationMessage,
  buildCriticalNotificationMessage,
  buildSuggestedReply,
  detectCriticalTopic,
  selectNotificationsToSend,
} from './notification/index.js';
export type {
  BuildNotificationMessageInput,
  NotificationMessage,
  EscalationResult,
  DetectCriticalInput,
  DetectCriticalCandidate,
  SelectNotificationsInput,
  SelectNotificationsResult,
} from './notification/index.js';

// 通知関連定数（Phase 5d / #3346）
export {
  NOTIFY_RECENT_SESSION_SAMPLE_N,
  NOTIFY_SESSION_GAP_MINUTES,
  NOTIFY_DEFAULT_BASE_HOURS,
  NOTIFY_BASE_MIN_HOURS,
  NOTIFY_MAX_INTERVAL_DAYS,
  NOTIFY_BACKOFF_BASE,
  NOTIFY_DAILY_NORMAL_CAP,
  NOTIFY_DAILY_CRITICAL_CAP,
  NOTIFY_ACTIVE_WINDOW_MINUTES,
  NOTIFICATION_EVENT_TTL_SECONDS,
  NOTIFY_CRITICAL_CARE_THRESHOLD,
  NOTIFY_CRITICAL_EVENT_HORIZON_DAYS,
  NOTIFY_INTENSITY_WINDOW_DAYS,
  // チャット API 保護ガード（Issue #3528）
  CHAT_RATE_LIMIT_PER_MINUTE,
  CHAT_RATE_LIMIT_PER_HOUR,
  CHAT_LOCK_TTL_MS,
  // セーフティ横断レビュー（ADR-2.22 / Issue #3580）
  SAFETY_REVIEW_DEFAULT_LIMIT,
} from './constants.js';

// チャット API 保護ガード（Issue #3528）
export type {
  RateLimitWindow,
  RateLimitResult,
  AcquireLockResult,
  ChatGuardRepository,
} from './repositories/chat-guard.repository.interface.js';
export { InMemoryChatGuardRepository } from './repositories/in-memory-chat-guard.repository.js';
export {
  DynamoDBChatGuardRepository,
  computeBucket,
  computeWindowTtlSec,
} from './repositories/dynamodb-chat-guard.repository.js';

// アカウント削除（退会・データ削除 / Issue #3579）
export type { AccountDeletionResult } from './entities/account-deletion.entity.js';
export type { AccountDeletionRepository } from './repositories/account-deletion.repository.interface.js';
export {
  DynamoDBAccountDeletionRepository,
  ACCOUNT_DELETION_ERROR_MESSAGES,
} from './repositories/dynamodb-account-deletion.repository.js';
export { InMemoryAccountDeletionRepository } from './repositories/in-memory-account-deletion.repository.js';

// Topic 中心モデル（リブトーク知識再設計 P1 / #3697、shadow build）
// P1 は「影で構築」するのみで、既存の想起・memory 画面には接続しない。
export type { TopicEntity, TopicKey, CreateTopicInput } from './entities/topic.entity.js';
export type {
  SelfFactEntity,
  SelfFactKey,
  CreateSelfFactInput,
} from './entities/self-fact.entity.js';
export type {
  WebFactEntity,
  WebFactKey,
  CreateWebFactInput,
  WebFactVolatility,
} from './entities/web-fact.entity.js';
export type { WebRawEntity, WebRawKey, CreateWebRawInput } from './entities/webraw.entity.js';
export type {
  ConsolidationCursorEntity,
  ConsolidationCursorKey,
  PutConsolidationCursorInput,
} from './entities/consolidation-cursor.entity.js';

export { TopicMapper } from './mappers/topic.mapper.js';
export { SelfFactMapper } from './mappers/self-fact.mapper.js';
export { WebFactMapper } from './mappers/web-fact.mapper.js';
export { WebRawMapper } from './mappers/webraw.mapper.js';
export { ConsolidationCursorMapper } from './mappers/consolidation-cursor.mapper.js';

export {
  buildTopicMetaSK,
  buildTopicBundleSKPrefix,
  buildSelfFactSK,
  buildSelfFactSKPrefix,
  buildWebFactSK,
  buildWebFactSKPrefix,
  buildWebRawSK,
  buildWebRawSKPrefix,
  buildConsolidationCursorSK,
  // GSI3（GSI-TOPIC）: Topic ヘッダ(META) 列挙・care 降順取得用 sparse GSI（#3697）
  TOPIC_GSI_INDEX_NAME,
  buildTopicGSI3PK,
  // GSI4（GSI-STALE）: 揮発 WEB fact の鮮度掃引用 sparse GSI（リブトーク知識再設計 P3 / #3699）
  STALE_GSI_INDEX_NAME,
  buildTopicStaleGSI4PK,
} from './mappers/keys.js';

export type { TopicRepository, TopicBundle } from './repositories/topic.repository.interface.js';
export { DynamoDBTopicRepository } from './repositories/dynamodb-topic.repository.js';
export { InMemoryTopicRepository } from './repositories/in-memory-topic.repository.js';

export type { WebRawRepository } from './repositories/webraw.repository.interface.js';
export { DynamoDBWebRawRepository } from './repositories/dynamodb-webraw.repository.js';
export { InMemoryWebRawRepository } from './repositories/in-memory-webraw.repository.js';

export type { ConsolidationCursorRepository } from './repositories/consolidation-cursor.repository.interface.js';
export { DynamoDBConsolidationCursorRepository } from './repositories/dynamodb-consolidation-cursor.repository.js';
export { InMemoryConsolidationCursorRepository } from './repositories/in-memory-consolidation-cursor.repository.js';

export { OptimisticLockError } from './repositories/optimistic-lock.error.js';

export { WEBRAW_TTL_SECONDS } from './constants.js';

// consolidation（集約バッチ）（リブトーク知識再設計 P1 / #3697、shadow build）
export {
  TOPIC_ROUTING_SIMILARITY_THRESHOLD,
  TOPIC_ROUTING_MAX_CANDIDATES,
  CONSOLIDATION_ROUTING_TEXT_MAX_CHARS,
  WEBFACT_REVIEW_INTERVAL_MS,
} from './constants.js';
export { ConsolidationSchema } from './llm-client/schemas/consolidation.schema.js';
export type { ConsolidationRaw } from './llm-client/schemas/consolidation.schema.js';
export {
  buildConsolidatePrompt,
  type ConsolidatePromptInput,
  type ConsolidatePromptCandidateTopic,
} from './usecases/consolidate.prompt.js';
export { consolidate, type ConsolidateParams } from './usecases/consolidate.usecase.js';

// Topic 想起（関連度 only）＋決定的忘却（リブトーク知識再設計 P2 / #3698）
export { TopicRetriever } from './knowledge/index.js';
export type { ITopicRetriever, RetrievedTopic, TopicRetrieveOptions } from './knowledge/index.js';
export { forgetSelfFact, type ForgetSelfFactDeps } from './usecases/forget-self-fact.usecase.js';
export {
  buildRegenerateSummaryPrompt,
  type RegenerateSummaryPromptInput,
} from './usecases/regenerate-summary.prompt.js';
export {
  RegenerateSummarySchema,
  type RegenerateSummaryRaw,
} from './llm-client/schemas/regenerate-summary.schema.js';
export {
  TOPIC_RECALL_SIMILARITY_THRESHOLD,
  TOPIC_RECALL_TOP_K,
  TOPIC_RECALL_RELATED_THRESHOLD,
  TOPIC_RECALL_RELATED_MAX,
} from './constants.js';
