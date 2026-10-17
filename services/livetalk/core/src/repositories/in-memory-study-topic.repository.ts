import { InMemoryEntityStore, type EntityStore, type InMemorySingleTableStore } from '@nagiyu/aws';
import type {
  CreateStudyTopicInput,
  StudyTopicEntity,
  StudyTopicKey,
  UpdateStudyTopicInput,
} from '../entities/study-topic.entity.js';
import { StudyTopicMapper } from '../mappers/study-topic.mapper.js';
import { buildStudyTopicSKPrefix, buildUserPK } from '../mappers/keys.js';
import type { StudyTopicRepository } from './study-topic.repository.interface.js';

export class InMemoryStudyTopicRepository implements StudyTopicRepository {
  private readonly mapper: StudyTopicMapper;
  private readonly store: InMemorySingleTableStore;
  private readonly nowMs: () => number;
  private readonly entityStore: EntityStore<StudyTopicEntity, StudyTopicKey>;

  constructor(store: InMemorySingleTableStore, nowMs: () => number = () => Date.now()) {
    this.store = store;
    this.nowMs = nowMs;
    this.mapper = new StudyTopicMapper();
    this.entityStore = new InMemoryEntityStore(store, this.mapper, { now: nowMs });
  }

  public async put(input: CreateStudyTopicInput): Promise<StudyTopicEntity> {
    const now = this.nowMs();
    return this.entityStore.put({ ...input, createdAt: now, updatedAt: now });
  }

  public async listByStatus(
    userId: string,
    characterId: string,
    status?: StudyTopicEntity['status']
  ): Promise<StudyTopicEntity[]> {
    const pk = buildUserPK(userId);
    const prefix = buildStudyTopicSKPrefix(characterId);
    const result = this.store.query({ pk, sk: { operator: 'begins_with', value: prefix } });
    const items = result.items
      .map((item) => this.mapper.toEntity(item))
      .filter((e) => status === undefined || e.status === status)
      .sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);
    return items;
  }

  public async updateStatus(input: UpdateStudyTopicInput): Promise<StudyTopicEntity> {
    return this.entityStore.update(
      { userId: input.userId, characterId: input.characterId, topicId: input.topicId },
      { status: input.status, priority: input.priority, expiresAt: input.expiresAt }
    );
  }

  public async findPendingByTopic(
    userId: string,
    characterId: string,
    topic: string
  ): Promise<StudyTopicEntity | null> {
    const all = await this.listByStatus(userId, characterId);
    const normalizedTopic = topic.toLowerCase();
    return (
      all.find(
        (e) =>
          (e.status === 'pending' || e.status === 'in_progress') &&
          e.topic.toLowerCase() === normalizedTopic
      ) ?? null
    );
  }
}
