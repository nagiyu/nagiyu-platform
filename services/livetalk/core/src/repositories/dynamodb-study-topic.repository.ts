import { PutCommand, UpdateCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { queryAllItems, toDatabaseError, type DynamoDBItem } from '@nagiyu/aws';
import type {
  CreateStudyTopicInput,
  StudyTopicEntity,
  UpdateStudyTopicInput,
} from '../entities/study-topic.entity.js';
import { StudyTopicMapper } from '../mappers/study-topic.mapper.js';
import { buildStudyTopicSK, buildStudyTopicSKPrefix, buildUserPK } from '../mappers/keys.js';
import type { StudyTopicRepository } from './study-topic.repository.interface.js';

export class DynamoDBStudyTopicRepository implements StudyTopicRepository {
  private readonly mapper: StudyTopicMapper;
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly nowMs: () => number;

  constructor(
    docClient: DynamoDBDocumentClient,
    tableName: string,
    nowMs: () => number = () => Date.now()
  ) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.nowMs = nowMs;
    this.mapper = new StudyTopicMapper();
  }

  public async put(input: CreateStudyTopicInput): Promise<StudyTopicEntity> {
    const now = this.nowMs();
    const entity: StudyTopicEntity = { ...input, CreatedAt: now, UpdatedAt: now };
    try {
      await this.docClient.send(
        new PutCommand({ TableName: this.tableName, Item: this.mapper.toItem(entity) })
      );
      return entity;
    } catch (error) {
      throw toDatabaseError(error);
    }
  }

  public async listByStatus(
    userId: string,
    characterId: string,
    status?: StudyTopicEntity['Status']
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
        if (status === undefined || entity.Status === status) {
          results.push(entity);
        }
      }
    } catch (error) {
      throw toDatabaseError(error);
    }

    return results.sort((a, b) => b.Priority - a.Priority || a.CreatedAt - b.CreatedAt);
  }

  public async updateStatus(input: UpdateStudyTopicInput): Promise<StudyTopicEntity> {
    const pk = buildUserPK(input.UserID);
    const sk = buildStudyTopicSK(input.CharacterID, input.TopicID);
    const now = this.nowMs();

    const expressionParts = [
      '#status = :status',
      '#priority = :priority',
      '#updatedAt = :updatedAt',
    ];
    const expressionAttributeNames: Record<string, string> = {
      '#status': 'Status',
      '#priority': 'Priority',
      '#updatedAt': 'UpdatedAt',
    };
    const expressionAttributeValues: Record<string, unknown> = {
      ':status': input.Status,
      ':priority': input.Priority,
      ':updatedAt': now,
    };

    if (input.Ttl !== undefined) {
      expressionParts.push('#ttl = :ttl');
      expressionAttributeNames['#ttl'] = 'Ttl';
      expressionAttributeValues[':ttl'] = input.Ttl;
    }

    try {
      const result = await this.docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { PK: pk, SK: sk },
          UpdateExpression: `SET ${expressionParts.join(', ')}`,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues,
          ReturnValues: 'ALL_NEW',
        })
      );
      return this.mapper.toEntity(result.Attributes as unknown as DynamoDBItem);
    } catch (error) {
      throw toDatabaseError(error);
    }
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
