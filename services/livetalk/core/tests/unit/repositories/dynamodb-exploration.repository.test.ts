import {
  DeleteCommand,
  PutCommand,
  QueryCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { DatabaseError } from '@nagiyu/aws';
import { DynamoDBExplorationRepository } from '../../../src/repositories/dynamodb-exploration.repository.js';

const TABLE = 'nagiyu-livetalk-test';
const FIXED_NOW = 1_700_000_000_000;

function makeRepo(mockSend: jest.Mock) {
  return new DynamoDBExplorationRepository(
    { send: mockSend } as unknown as DynamoDBDocumentClient,
    TABLE,
    () => FIXED_NOW
  );
}

const itemRaw = {
  PK: 'USER#u1',
  SK: 'CHAR#hiyori#EXPLORE#t1',
  Type: 'Exploration',
  UserID: 'u1',
  CharacterID: 'hiyori',
  TopicID: 't1',
  ExploredAt: 123,
  RecentAngles: ['a'],
  UpdatedAt: FIXED_NOW,
  CreatedAt: FIXED_NOW,
};

describe('DynamoDBExplorationRepository', () => {
  it('put は PutCommand で探索時刻を保存する', async () => {
    const mockSend = jest.fn().mockResolvedValue({});
    const repo = makeRepo(mockSend);

    const entity = await repo.put({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 't1',
      exploredAt: 123,
      recentAngles: ['a'],
    });

    expect(entity).toEqual({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 't1',
      exploredAt: 123,
      recentAngles: ['a'],
      updatedAt: FIXED_NOW,
    });
    const command = mockSend.mock.calls[0][0] as PutCommand;
    expect(command).toBeInstanceOf(PutCommand);
    expect(command.input.Item).toMatchObject({ PK: 'USER#u1', SK: 'CHAR#hiyori#EXPLORE#t1' });
  });

  it('listAll は EXPLORE プレフィックスで Query して Entity に変換する', async () => {
    const mockSend = jest.fn().mockResolvedValue({ Items: [itemRaw] });
    const repo = makeRepo(mockSend);

    const list = await repo.listAll('u1', 'hiyori');

    expect(list).toHaveLength(1);
    expect(list[0].exploredAt).toBe(123);
    const command = mockSend.mock.calls[0][0] as QueryCommand;
    expect(command.input.ExpressionAttributeValues).toEqual({
      ':pk': 'USER#u1',
      ':prefix': 'CHAR#hiyori#EXPLORE#',
    });
  });

  it('listAll の DynamoDB エラーは DatabaseError にする', async () => {
    const repo = makeRepo(jest.fn().mockRejectedValue(new Error('DB down')));

    await expect(repo.listAll('u1', 'hiyori')).rejects.toThrow(DatabaseError);
  });

  it('delete は DeleteCommand を送る', async () => {
    const mockSend = jest.fn().mockResolvedValue({});
    const repo = makeRepo(mockSend);

    await repo.delete({ userId: 'u1', characterId: 'hiyori', topicId: 't1' });

    const command = mockSend.mock.calls[0][0] as DeleteCommand;
    expect(command).toBeInstanceOf(DeleteCommand);
    expect(command.input.Key).toEqual({ PK: 'USER#u1', SK: 'CHAR#hiyori#EXPLORE#t1' });
  });
});
