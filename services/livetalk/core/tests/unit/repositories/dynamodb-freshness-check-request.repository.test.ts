import {
  DynamoDBDocumentClient,
  DeleteCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { DynamoDBFreshnessCheckRequestRepository } from '../../../src/repositories/dynamodb-freshness-check-request.repository.js';

const TABLE = 'nagiyu-livetalk-test';
const FIXED_NOW = 1_700_000_000_000;

function makeRepo(mockSend: jest.Mock) {
  return new DynamoDBFreshnessCheckRequestRepository(
    { send: mockSend } as unknown as DynamoDBDocumentClient,
    TABLE,
    () => FIXED_NOW
  );
}

function makeItem(topicId: string, createdAt: number): Record<string, unknown> {
  return {
    PK: 'USER#u1',
    SK: `CHAR#hiyori#FRESHCHECK#${topicId}`,
    Type: 'FreshnessCheckRequest',
    UserID: 'u1',
    CharacterID: 'hiyori',
    TopicID: topicId,
    CreatedAt: createdAt,
    UpdatedAt: createdAt,
  };
}

describe('DynamoDBFreshnessCheckRequestRepository', () => {
  it('put は PutCommand で TTL 付きの Item を書く', async () => {
    const mockSend = jest.fn().mockResolvedValue({});

    const entity = await makeRepo(mockSend).put({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 't1',
      expiresAt: FIXED_NOW + 7000,
    });

    expect(entity.topicId).toBe('t1');
    const command = mockSend.mock.calls[0][0] as PutCommand;
    expect(command).toBeInstanceOf(PutCommand);
    expect(command.input.Item).toMatchObject({
      PK: 'USER#u1',
      SK: 'CHAR#hiyori#FRESHCHECK#t1',
      TTL: Math.floor((FIXED_NOW + 7000) / 1000),
    });
  });

  it('listByCharacter は SK プレフィックスで Query し、依頼時刻の古い順に返す', async () => {
    const mockSend = jest.fn().mockResolvedValue({
      Items: [makeItem('b', FIXED_NOW), makeItem('a', FIXED_NOW - 1000)],
    });

    const list = await makeRepo(mockSend).listByCharacter('u1', 'hiyori');

    expect(list.map((r) => r.topicId)).toEqual(['a', 'b']);
    const command = mockSend.mock.calls[0][0] as QueryCommand;
    expect(command).toBeInstanceOf(QueryCommand);
    expect(command.input.ExpressionAttributeValues).toEqual({
      ':pk': 'USER#u1',
      ':prefix': 'CHAR#hiyori#FRESHCHECK#',
    });
  });

  it('listByCharacter は DynamoDB の失敗を DatabaseError にして投げる', async () => {
    const mockSend = jest.fn().mockRejectedValue(new Error('boom'));

    await expect(makeRepo(mockSend).listByCharacter('u1', 'hiyori')).rejects.toThrow();
  });

  it('delete は DeleteCommand で削除する', async () => {
    const mockSend = jest.fn().mockResolvedValue({});

    await makeRepo(mockSend).delete({ userId: 'u1', characterId: 'hiyori', topicId: 't1' });

    const command = mockSend.mock.calls[0][0] as DeleteCommand;
    expect(command).toBeInstanceOf(DeleteCommand);
    expect(command.input.Key).toEqual({ PK: 'USER#u1', SK: 'CHAR#hiyori#FRESHCHECK#t1' });
  });
});
