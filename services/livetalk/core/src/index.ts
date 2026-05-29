export * from './voicevox/index.js';
export * from './llm-client/index.js';
export * from './constants.js';

// Memory retrieval
export { cosineSimilarity, MemoryRetriever } from './memory/index.js';
export type { IMemoryRetriever, RetrieveOptions, RetrievedMemory } from './memory/index.js';

// Safety
export * from './safety/index.js';

// Characters
export * from './characters/index.js';

// Sentence splitter
export { SentenceBuffer } from './lib/sentence-splitter.js';

// Chat usecase
export { runChatUseCase, type ChatEvent, type ChatUseCaseParams } from './usecases/chat-usecase.js';

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

// Mappers
export { MemoryMapper } from './mappers/memory.mapper.js';
export { MemorySummaryMapper } from './mappers/memory-summary.mapper.js';
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
  buildMemorySK,
  buildMemoryTierSKPrefix,
  buildMemoryCategoryInTierSKPrefix,
  buildMemoryAllTiersSKPrefix,
  buildMemorySummarySK,
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
} from './constants.js';
