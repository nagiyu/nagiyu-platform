import { InMemoryEntityStore, type EntityStore, type InMemorySingleTableStore } from '@nagiyu/aws';
import type { CreateNoteInput, NoteEntity, NoteKey } from '../entities/note.entity.js';
import { NoteMapper } from '../mappers/note.mapper.js';
import { buildNoteSKPrefix, buildUserPK } from '../mappers/keys.js';
import type { NoteRepository } from './note.repository.interface.js';

export class InMemoryNoteRepository implements NoteRepository {
  private readonly mapper = new NoteMapper();
  private readonly store: InMemorySingleTableStore;
  private readonly nowMs: () => number;
  private readonly entityStore: EntityStore<NoteEntity, NoteKey>;

  constructor(store: InMemorySingleTableStore, nowMs: () => number = () => Date.now()) {
    this.store = store;
    this.nowMs = nowMs;
    this.entityStore = new InMemoryEntityStore(store, this.mapper, { now: nowMs });
  }

  public async put(input: CreateNoteInput): Promise<NoteEntity> {
    const now = this.nowMs();
    return this.entityStore.put({ ...input, createdAt: now, updatedAt: now });
  }

  public async list(userId: string, characterId: string, limit = 100): Promise<NoteEntity[]> {
    const pk = buildUserPK(userId);
    const prefix = buildNoteSKPrefix(characterId);
    // ストアはソートキー昇順で返すため、全件取得して CreatedAt 降順に並べてから limit を適用する。
    const items = this.store.queryAll({ pk, sk: { operator: 'begins_with', value: prefix } });
    return items
      .map((item) => this.mapper.toEntity(item))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  public async listAll(userId: string, characterId: string): Promise<NoteEntity[]> {
    const pk = buildUserPK(userId);
    const prefix = buildNoteSKPrefix(characterId);
    const items = this.store.queryAll({ pk, sk: { operator: 'begins_with', value: prefix } });
    return items
      .map((item) => this.mapper.toEntity(item))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  public async get(key: NoteKey): Promise<NoteEntity | null> {
    return this.entityStore.get(key);
  }

  public async listRecent(
    userId: string,
    characterId: string,
    options: { days: number; limit?: number }
  ): Promise<NoteEntity[]> {
    const { days, limit = 100 } = options;
    const threshold = this.nowMs() - days * 24 * 60 * 60 * 1000;
    const all = await this.list(userId, characterId, limit);
    return all.filter((note) => note.createdAt >= threshold);
  }

  public async updateReaction(key: NoteKey, reaction: string): Promise<void> {
    await this.entityStore.update(key, { reaction });
  }
}
