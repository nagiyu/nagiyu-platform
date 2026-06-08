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
  /**
   * 親密度を delta 分だけ加算して永続化する（Phase 3f）。
   *
   * 上昇のみ保証（calculator.updateAffectionLevel を内部で使用）。
   * CharacterState が未作成の場合は自動生成する。
   */
  updateAffection(
    userId: string,
    characterId: string,
    delta: number
  ): Promise<CharacterStateEntity>;
}
