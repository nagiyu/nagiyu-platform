import { InMemorySingleTableStore } from '@nagiyu/aws';
import type {
  CreateStudyTopicInput,
  StudyTopicEntity,
  UpdateStudyTopicInput,
} from '../entities/study-topic.entity.js';
import { StudyTopicMapper } from '../mappers/study-topic.mapper.js';
import { buildStudyTopicSKPrefix, buildUserPK } from '../mappers/keys.js';
import type { StudyTopicRepository } from './study-topic.repository.interface.js';

export class InMemoryStudyTopicRepository implements StudyTopicRepository {
  private readonly mapper: StudyTopicMapper;
  private readonly store: InMemorySingleTableStore;
  private readonly nowMs: () => number;

  constructor(store: InMemorySingleTableStore, nowMs: () => number = () => Date.now()) {
    this.store = store;
    this.nowMs = nowMs;
    this.mapper = new StudyTopicMapper();
  }

  public async put(input: CreateStudyTopicInput): Promise<StudyTopicEntity> {
    const now = this.nowMs();
    const entity: StudyTopicEntity = { ...input, CreatedAt: now, UpdatedAt: now };
    this.store.put(this.mapper.toItem(entity));
    return entity;
  }

  public async listByStatus(
    userId: string,
    characterId: string,
    status?: StudyTopicEntity['Status']
  ): Promise<StudyTopicEntity[]> {
    const pk = buildUserPK(userId);
    const prefix = buildStudyTopicSKPrefix(characterId);
    const result = this.store.query({ pk, sk: { operator: 'begins_with', value: prefix } });
    const items = result.items
      .map((item) => this.mapper.toEntity(item))
      .filter((e) => status === undefined || e.Status === status)
      .sort((a, b) => b.Priority - a.Priority || a.CreatedAt - b.CreatedAt);
    return items;
  }

  public async updateStatus(input: UpdateStudyTopicInput): Promise<StudyTopicEntity> {
    const pk = buildUserPK(input.UserID);
    const prefix = buildStudyTopicSKPrefix(input.CharacterID);
    const result = this.store.query({ pk, sk: { operator: 'begins_with', value: prefix } });
    const found = result.items
      .map((item) => this.mapper.toEntity(item))
      .find((e) => e.TopicID === input.TopicID);

    if (!found) {
      throw new Error(`StudyTopic not found: ${input.TopicID}`);
    }

    const updated: StudyTopicEntity = {
      ...found,
      Status: input.Status,
      Priority: input.Priority,
      UpdatedAt: this.nowMs(),
    };
    if (input.Ttl !== undefined) {
      updated.Ttl = input.Ttl;
    }
    this.store.put(this.mapper.toItem(updated));
    return updated;
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
          (e.Status === 'pending' || e.Status === 'in_progress') &&
          e.Topic.toLowerCase() === normalizedTopic
      ) ?? null
    );
  }
}
