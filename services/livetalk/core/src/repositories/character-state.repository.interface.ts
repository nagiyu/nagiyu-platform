import type {
  CharacterStateEntity,
  CharacterStateKey,
  CreateCharacterStateInput,
  UpdateCharacterStateInput,
} from '../entities/character-state.entity.js';

/**
 * ユーザー × キャラの状態リポジトリ。
 */
export interface CharacterStateRepository {
  getById(key: CharacterStateKey): Promise<CharacterStateEntity | null>;
  upsert(
    input: CreateCharacterStateInput,
    updates?: UpdateCharacterStateInput
  ): Promise<CharacterStateEntity>;
}
