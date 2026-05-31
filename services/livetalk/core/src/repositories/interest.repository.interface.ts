import type {
  CreateInterestCategoryInput,
  InterestCategoryEntity,
  InterestCategoryKey,
} from '../entities/interest-category.entity.js';

export interface InterestRepository {
  get(
    userId: string,
    characterId: string,
    category: string
  ): Promise<InterestCategoryEntity | null>;
  list(userId: string, characterId: string): Promise<InterestCategoryEntity[]>;
  put(input: CreateInterestCategoryInput): Promise<InterestCategoryEntity>;
  update(entity: InterestCategoryEntity): Promise<InterestCategoryEntity>;
  delete(key: InterestCategoryKey): Promise<void>;
}
