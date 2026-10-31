import {
  InMemoryEntityStore,
  type EntityPutInput,
  type EntityStore,
  type InMemorySingleTableStore,
} from '@nagiyu/aws';
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
  private readonly nowMs: () => number;
  private readonly entityStore: EntityStore<CharacterStateEntity, CharacterStateKey>;

  constructor(store: InMemorySingleTableStore, nowMs: () => number = () => Date.now()) {
    this.nowMs = nowMs;
    this.entityStore = new InMemoryEntityStore(store, new CharacterStateMapper(), { now: nowMs });
  }

  public async getById(key: CharacterStateKey): Promise<CharacterStateEntity | null> {
    return this.entityStore.get(key);
  }

  public async upsert(
    input: CreateCharacterStateInput,
    updates: UpdateCharacterStateInput = {}
  ): Promise<CharacterStateEntity> {
    const existing = await this.getById({
      userId: input.userId,
      characterId: input.characterId,
    });
    const merged: EntityPutInput<CharacterStateEntity> = {
      userId: input.userId,
      characterId: input.characterId,
      lastInteractionAt: updates.lastInteractionAt ?? input.lastInteractionAt,
      affectionLevel:
        updates.affectionLevel ?? input.affectionLevel ?? existing?.affectionLevel ?? 0,
      createdAt: existing?.createdAt,
    };
    return this.entityStore.put(merged);
  }

  public async updateAffection(
    userId: string,
    characterId: string,
    delta: number
  ): Promise<CharacterStateEntity> {
    const now = this.nowMs();
    const existing = await this.getById({ userId, characterId });
    const currentLevel = existing?.affectionLevel ?? 0;
    const newLevel = updateAffectionLevel(currentLevel, delta);

    return this.upsert(
      {
        userId,
        characterId,
        lastInteractionAt: existing?.lastInteractionAt ?? now,
        affectionLevel: newLevel,
      },
      { lastInteractionAt: now, affectionLevel: newLevel }
    );
  }
}
