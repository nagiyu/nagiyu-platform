export * from './voicevox/index.js';
export * from './llm-client/index.js';
export * from './constants.js';

// Characters
export * from './characters/index.js';

// Sentence splitter
export { SentenceBuffer } from './lib/sentence-splitter.js';

// Chat usecase
export { runChatUseCase, type ChatEvent, type ChatUseCaseParams } from './usecases/chat-usecase.js';

// Entities
export type { MessageEntity, MessageKey, CreateMessageInput } from './entities/message.entity.js';
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
export {
  buildUserPK,
  buildProfileSK,
  buildCharacterStateSK,
  buildMessageSK,
  buildMessageSKPrefix,
} from './mappers/keys.js';

// Repository interfaces
export type {
  MessageRepository,
  GetRecentByTokenBudgetOptions,
  RecentMessagesResult,
} from './repositories/message.repository.interface.js';
export type { ProfileRepository } from './repositories/profile.repository.interface.js';
export type { CharacterStateRepository } from './repositories/character-state.repository.interface.js';

// Repository implementations
export { DynamoDBMessageRepository } from './repositories/dynamodb-message.repository.js';
export { DynamoDBProfileRepository } from './repositories/dynamodb-profile.repository.js';
export { DynamoDBCharacterStateRepository } from './repositories/dynamodb-character-state.repository.js';
export { InMemoryMessageRepository } from './repositories/in-memory-message.repository.js';
export { InMemoryProfileRepository } from './repositories/in-memory-profile.repository.js';
export { InMemoryCharacterStateRepository } from './repositories/in-memory-character-state.repository.js';

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
export { LIVETALK_TERMS_VERSION, LIVETALK_PRIVACY_VERSION } from './constants.js';
