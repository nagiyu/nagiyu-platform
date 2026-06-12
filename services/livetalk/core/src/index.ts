// TTS プロバイダ非依存ポート（IVoiceClient / VoiceConfig）
export * from './voice/index.js';
export * from './voicevox/index.js';
export * from './openai-voice/index.js';
export * from './llm-client/index.js';
export type { SummarizeInput, SummarizeResult, MemoryCandidate } from './llm-client/types.js';
export * from './constants.js';

// Affection
export type { AffectionFactors } from './affection/index.js';
export {
  calculateAffectionDelta,
  calculateBidirectionalityDelta,
  updateAffectionLevel,
  isNewActiveDay,
} from './affection/index.js';

// Interest category
export type { ExtractedCategory, InterestDedupOptions } from './interest/index.js';
export { persistInterestCategories } from './interest/index.js';

// Memory retrieval + confirmation + correction
export { cosineSimilarity, MemoryRetriever } from './memory/index.js';
export type {
  IMemoryRetriever,
  RetrieveOptions,
  RetrievedMemory,
  RetrieveResult,
} from './memory/index.js';
export {
  detectCorrection,
  identifyPromotionCandidates,
  identifyNewLearnings,
  applyCorrection,
  executePromotion,
} from './memory/index.js';
export type { CorrectionResult } from './memory/index.js';

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

// Compress conversation usecase
export {
  compressConversation,
  type CompressConversationParams,
} from './usecases/compress-conversation.usecase.js';

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

// Entities
export type {
  MemoryEntity,
  MemoryKey,
  CreateMemoryInput,
  UpdateMemoryInput,
  Tier,
} from './entities/memory.entity.js';
export { TIERS } from './entities/memory.entity.js';
export type { MessageEntity, MessageKey, CreateMessageInput } from './entities/message.entity.js';
export type {
  MemorySummaryEntity,
  MemorySummaryKey,
  CreateMemorySummaryInput,
} from './entities/memory-summary.entity.js';
export type {
  SafetyEventEntity,
  SafetyEventKey,
  CreateSafetyEventInput,
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
export type {
  InterestCategoryEntity,
  InterestCategoryKey,
  CreateInterestCategoryInput,
} from './entities/interest-category.entity.js';

// Mappers
export { MemoryMapper } from './mappers/memory.mapper.js';
export { MemorySummaryMapper } from './mappers/memory-summary.mapper.js';
export { MessageMapper } from './mappers/message.mapper.js';
export { ProfileMapper } from './mappers/profile.mapper.js';
export { CharacterStateMapper } from './mappers/character-state.mapper.js';
export { InterestCategoryMapper } from './mappers/interest-category.mapper.js';
export { SafetyEventMapper } from './mappers/safety-event.mapper.js';
export {
  buildUserPK,
  buildProfileSK,
  buildCharacterStateSK,
  buildMessageSK,
  buildMessageSKPrefix,
  buildSafetyEventSK,
  buildSafetyEventSKPrefix,
  buildMemorySK,
  buildMemoryTierSKPrefix,
  buildMemoryCategoryInTierSKPrefix,
  buildMemoryAllTiersSKPrefix,
  buildMemorySummarySK,
  buildInterestSK,
  buildInterestSKPrefix,
  buildLifecycleSK,
  // GSI1: Profile 列挙用 sparse GSI（#3527）
  PROFILE_GSI_INDEX_NAME,
  buildProfileGSI1PK,
} from './mappers/keys.js';

// Repository interfaces
export type { MemoryRepository } from './repositories/memory.repository.interface.js';
export type { MemorySummaryRepository } from './repositories/memory-summary.repository.interface.js';
export type {
  MessageRepository,
  GetRecentByTokenBudgetOptions,
  RecentMessagesResult,
} from './repositories/message.repository.interface.js';
export type { ProfileRepository } from './repositories/profile.repository.interface.js';
export type { CharacterStateRepository } from './repositories/character-state.repository.interface.js';
export type { SafetyEventRepository } from './repositories/safety-event.repository.interface.js';
export type { InterestRepository } from './repositories/interest.repository.interface.js';

// Repository implementations
export { EmbeddingMemoryRepository } from './repositories/embedding-memory.repository.js';
export { DynamoDBMemoryRepository } from './repositories/dynamodb-memory.repository.js';
export { DynamoDBMemorySummaryRepository } from './repositories/dynamodb-memory-summary.repository.js';
export { DynamoDBMessageRepository } from './repositories/dynamodb-message.repository.js';
export { DynamoDBProfileRepository } from './repositories/dynamodb-profile.repository.js';
export { DynamoDBCharacterStateRepository } from './repositories/dynamodb-character-state.repository.js';
export { DynamoDBSafetyEventRepository } from './repositories/dynamodb-safety-event.repository.js';
export { InMemoryMemoryRepository } from './repositories/in-memory-memory.repository.js';
export { InMemoryMemorySummaryRepository } from './repositories/in-memory-memory-summary.repository.js';
export { InMemoryMessageRepository } from './repositories/in-memory-message.repository.js';
export { InMemoryProfileRepository } from './repositories/in-memory-profile.repository.js';
export { InMemoryCharacterStateRepository } from './repositories/in-memory-character-state.repository.js';
export { InMemorySafetyEventRepository } from './repositories/in-memory-safety-event.repository.js';
export { InMemoryInterestRepository } from './repositories/in-memory-interest.repository.js';
export { DynamoDBInterestRepository } from './repositories/dynamodb-interest.repository.js';

// Knowledge（Phase 5a）
export type {
  KnowledgeEntity,
  KnowledgeKey,
  CreateKnowledgeInput,
} from './entities/knowledge.entity.js';
export type { KnowledgeRepository } from './repositories/knowledge.repository.interface.js';
export { InMemoryKnowledgeRepository } from './repositories/in-memory-knowledge.repository.js';
export { DynamoDBKnowledgeRepository } from './repositories/dynamodb-knowledge.repository.js';
export { KnowledgeMapper } from './mappers/knowledge.mapper.js';
export { buildKnowledgeSK, buildKnowledgeSKPrefix } from './mappers/keys.js';

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

// 知識ゲート（Phase 5b / #3344）
export {
  searchKnowledge,
  classifyTopic,
  evaluateKnowledgeGate,
  type KnowledgeGateResult,
} from './study/knowledge-gate.js';
export {
  type KnowledgeMatcher,
  NgramKnowledgeMatcher,
  normalizeForMatch,
  toBigrams,
} from './study/knowledge-matcher.js';
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
  MEMORY_TIER_C_TTL_SECONDS,
  MEMORY_TIER_D_TTL_SECONDS,
  MEMORY_DEFAULT_CONFIDENCE,
  AFFECTION_INFO_DISCLOSURE_WEIGHT,
  AFFECTION_TIME_CONTINUITY_BONUS,
  AFFECTION_BIDIRECTIONALITY_WEIGHT,
  INTEREST_DEDUP_SIMILARITY_THRESHOLD,
  STUDY_MAX_QUERIES_PER_RUN,
  STUDY_MIN_INTERVAL_HOURS,
  STUDY_INACTIVE_WINDOW_HOURS,
  STUDY_MIN_SUMMARY_LENGTH,
  STUDY_TOPIC_TTL_SECONDS,
  STUDY_TOPIC_GATE_PRIORITY,
  NOTE_MIN_SUMMARY_LENGTH,
  NOTE_MAX_PER_RUN,
  NOTE_KNOWLEDGE_LOOKBACK,
  NOTE_RECENT_DAYS,
  NOTE_RECENT_LIMIT,
} from './constants.js';

// Study usecase（Phase 5a）
export {
  studyForUser,
  shouldStudyNow,
  type StudyForUserParams,
  type StudyForUserResult,
} from './usecases/study.usecase.js';

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
  detectCriticalKnowledge,
  selectNotificationsToSend,
} from './notification/index.js';
export type {
  BuildNotificationMessageInput,
  NotificationMessage,
  EscalationResult,
  DetectCriticalInput,
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
  NOTIFY_CRITICAL_INTEREST_SHARE_THRESHOLD,
  NOTIFY_CRITICAL_EVENT_HORIZON_DAYS,
  NOTIFY_INTENSITY_WINDOW_DAYS,
} from './constants.js';
