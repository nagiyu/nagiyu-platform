import { type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDBEntityStore, queryAllItems, toDatabaseError, type EntityStore } from '@nagiyu/aws';
import type {
  CreateStudyTopicInput,
  StudyTopicEntity,
  StudyTopicKey,
  UpdateStudyTopicInput,
} from '../entities/study-topic.entity.js';
import { StudyTopicMapper } from '../mappers/study-topic.mapper.js';
import { buildStudyTopicSKPrefix, buildUserPK } from '../mappers/keys.js';
import type { StudyTopicRepository } from './study-topic.repository.interface.js';

export class DynamoDBStudyTopicRepository implements StudyTopicRepository {
  private readonly mapper: StudyTopicMapper;
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly nowMs: () => number;
  private readonly entityStore: EntityStore<StudyTopicEntity, StudyTopicKey>;

  constructor(
    docClient: DynamoDBDocumentClient,
    tableName: string,
    nowMs: () => number = () => Date.now()
  ) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.nowMs = nowMs;
    this.mapper = new StudyTopicMapper();
    this.entityStore = new DynamoDBEntityStore(docClient, tableName, this.mapper, { now: nowMs });
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
    const results: StudyTopicEntity[] = [];

    try {
      const items = await queryAllItems(this.docClient, {
        TableName: this.tableName,
        KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :prefix)',
        ExpressionAttributeNames: { '#pk': 'PK', '#sk': 'SK' },
        ExpressionAttributeValues: { ':pk': pk, ':prefix': prefix },
      });
      for (const raw of items) {
        const entity = this.mapper.toEntity(raw);
        if (status === undefined || entity.status === status) {
          results.push(entity);
        }
      }
    } catch (error) {
      throw toDatabaseError(error);
    }

    return results.sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);
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
