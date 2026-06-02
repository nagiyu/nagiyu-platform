import { InMemorySingleTableStore } from '@nagiyu/aws';
import type { CreateNoteInput, NoteEntity, NoteKey } from '../entities/note.entity.js';
import { NoteMapper } from '../mappers/note.mapper.js';
import { buildNoteSK, buildNoteSKPrefix, buildUserPK } from '../mappers/keys.js';
import type { NoteRepository } from './note.repository.interface.js';

export class InMemoryNoteRepository implements NoteRepository {
  private readonly mapper: NoteMapper;
  private readonly store: InMemorySingleTableStore;
  private readonly nowMs: () => number;

  constructor(store: InMemorySingleTableStore, nowMs: () => number = () => Date.now()) {
    this.store = store;
    this.nowMs = nowMs;
    this.mapper = new NoteMapper();
  }

  public async put(input: CreateNoteInput): Promise<NoteEntity> {
    const now = this.nowMs();
    const entity: NoteEntity = { ...input, CreatedAt: now, UpdatedAt: now };
    this.store.put(this.mapper.toItem(entity));
    return entity;
  }

  public async list(userId: string, characterId: string, limit = 100): Promise<NoteEntity[]> {
    const pk = buildUserPK(userId);
    const prefix = buildNoteSKPrefix(characterId);
    // InMemorySingleTableStore は挿入順で返すため、全件取得して CreatedAt 降順に並べてから limit を適用する。
    const result = this.store.query({ pk, sk: { operator: 'begins_with', value: prefix } });
    return result.items
      .map((item) => this.mapper.toEntity(item))
      .sort((a, b) => b.CreatedAt - a.CreatedAt)
      .slice(0, limit);
  }

  public async get(key: NoteKey): Promise<NoteEntity | null> {
    const pk = buildUserPK(key.userId);
    const sk = buildNoteSK(key.characterId, key.noteId);
    const item = this.store.get(pk, sk);
    if (!item) return null;
    return this.mapper.toEntity(item);
  }

  public async listRecent(
    userId: string,
    characterId: string,
    options: { days: number; limit?: number }
  ): Promise<NoteEntity[]> {
    const { days, limit = 100 } = options;
    const threshold = this.nowMs() - days * 24 * 60 * 60 * 1000;
    const all = await this.list(userId, characterId, limit);
    return all.filter((note) => note.CreatedAt >= threshold);
  }
}
