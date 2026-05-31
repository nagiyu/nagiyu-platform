import { InMemorySingleTableStore } from '@nagiyu/aws';
import { updateAffectionLevel } from '../affection/calculator.js';
import type {
  CharacterStateEntity,
  CharacterStateKey,
  CreateCharacterStateInput,
  UpdateCharacterStateInput,
} from '../entities/character-state.entity.js';
import { CharacterStateMapper } from '../mappers/character-state.mapper.js';
import type { CharacterStateRepository } from './character-state.repository.interface.js';

export class InMemoryCharacterStateRepository implements CharacterStateRepository {
  private readonly mapper: CharacterStateMapper;
  private readonly store: InMemorySingleTableStore;
  private readonly nowMs: () => number;

  constructor(store: InMemorySingleTableStore, nowMs: () => number = () => Date.now()) {
    this.store = store;
    this.nowMs = nowMs;
    this.mapper = new CharacterStateMapper();
  }

  public async getById(key: CharacterStateKey): Promise<CharacterStateEntity | null> {
    const { pk, sk } = this.mapper.buildKeys(key);
    const item = this.store.get(pk, sk);
    if (!item) return null;
    return this.mapper.toEntity(item);
  }

  public async upsert(
    input: CreateCharacterStateInput,
    updates: UpdateCharacterStateInput = {}
  ): Promise<CharacterStateEntity> {
    const now = this.nowMs();
    const existing = await this.getById({
      userId: input.UserID,
      characterId: input.CharacterID,
    });
    const merged: CharacterStateEntity = {
      UserID: input.UserID,
      CharacterID: input.CharacterID,
      LastInteractionAt: updates.LastInteractionAt ?? input.LastInteractionAt,
      AffectionLevel:
        updates.AffectionLevel ?? input.AffectionLevel ?? existing?.AffectionLevel ?? 0,
      CreatedAt: existing?.CreatedAt ?? now,
      UpdatedAt: now,
    };
    this.store.put(this.mapper.toItem(merged));
    return merged;
  }

  public async updateAffection(
    userId: string,
    characterId: string,
    delta: number
  ): Promise<CharacterStateEntity> {
    const now = this.nowMs();
    const existing = await this.getById({ userId, characterId });
    const currentLevel = existing?.AffectionLevel ?? 0;
    const newLevel = updateAffectionLevel(currentLevel, delta);

    return this.upsert(
      {
        UserID: userId,
        CharacterID: characterId,
        LastInteractionAt: existing?.LastInteractionAt ?? now,
        AffectionLevel: newLevel,
      },
      { LastInteractionAt: now, AffectionLevel: newLevel }
    );
  }
}
