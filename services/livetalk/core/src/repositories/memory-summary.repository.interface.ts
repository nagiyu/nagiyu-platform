import type {
  CreateMemorySummaryInput,
  MemorySummaryEntity,
} from '../entities/memory-summary.entity.js';

export interface MemorySummaryRepository {
  get(userId: string, characterId: string): Promise<MemorySummaryEntity | null>;
  put(input: CreateMemorySummaryInput): Promise<MemorySummaryEntity>;
}
