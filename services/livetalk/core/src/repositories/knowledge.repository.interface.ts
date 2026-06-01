import type {
  CreateKnowledgeInput,
  KnowledgeEntity,
} from '../entities/knowledge.entity.js';

export interface KnowledgeRepository {
  put(input: CreateKnowledgeInput): Promise<KnowledgeEntity>;
  list(userId: string, characterId: string, limit?: number): Promise<KnowledgeEntity[]>;
  /** 最新の Knowledge を 1 件返す。なければ null。 */
  getLatest(userId: string, characterId: string): Promise<KnowledgeEntity | null>;
}
