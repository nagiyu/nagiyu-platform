import { InMemoryEntityStore, type EntityStore, type InMemorySingleTableStore } from '@nagiyu/aws';
import type {
  NoteSkipEntity,
  NoteSkipKey,
  PutNoteSkipInput,
} from '../entities/note-skip.entity.js';
import { NoteSkipMapper } from '../mappers/note-skip.mapper.js';
import { buildNoteSkipSKPrefix, buildUserPK } from '../mappers/keys.js';
import type { NoteSkipRepository } from './note-skip.repository.interface.js';

export class InMemoryNoteSkipRepository implements NoteSkipRepository {
  private readonly mapper = new NoteSkipMapper();
  private readonly store: InMemorySingleTableStore;
  private readonly entityStore: EntityStore<NoteSkipEntity, NoteSkipKey>;

  constructor(store: InMemorySingleTableStore, nowMs: () => number = () => Date.now()) {
    this.store = store;
    this.entityStore = new InMemoryEntityStore(store, this.mapper, { now: nowMs });
  }

  public async put(input: PutNoteSkipInput): Promise<NoteSkipEntity> {
    return this.entityStore.put(input);
  }

  public async listAll(userId: string, characterId: string): Promise<NoteSkipEntity[]> {
    const pk = buildUserPK(userId);
    const prefix = buildNoteSkipSKPrefix(characterId);
    return this.store
      .queryAll({ pk, sk: { operator: 'begins_with', value: prefix } })
      .map((item) => this.mapper.toEntity(item));
  }

  public async delete(key: NoteSkipKey): Promise<void> {
    await this.entityStore.deleteIfExists(key);
  }
}
