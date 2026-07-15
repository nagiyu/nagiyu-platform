/**
 * 旧知識資材（Memory / Knowledge / InterestCategory）→ 新 Topic モデルへの
 * 一回性マイグレーション専用モジュール（throwaway コード）。
 *
 * 移行完了・Issue クローズ後は本ディレクトリごと削除してよい。
 */
export type {
  LegacyMemoryEntity,
  LegacyKnowledgeEntity,
  LegacyInterestCategoryEntity,
  LegacyReadResult,
} from './legacy-types.js';
export { readLegacyData } from './legacy-reader.js';
export {
  buildPseudoMessages,
  buildPseudoWebRaws,
  chunkPseudoSources,
  type PseudoSourceChunk,
} from './pseudo-source.js';
export { createChunkRepos, type ChunkRepos } from './chunk-repos.js';
export { computeCareBoosts, applyCareBoosts, type ApplyCareBoostsResult } from './care-seeder.js';
export {
  classifySchemaItem,
  findSchemaItems,
  deleteSchemaItems,
  type SchemaTarget,
  type DeleteSchemaItemsResult,
} from './schema-janitor.js';
export { queryItemsByPrefix, batchDeleteItems, MIGRATION_ERROR_MESSAGES } from './dynamo-helpers.js';
