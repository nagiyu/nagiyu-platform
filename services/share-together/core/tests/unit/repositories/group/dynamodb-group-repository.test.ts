import { GetCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDBGroupRepository } from '../../../../src/repositories/group/dynamodb-group-repository.js';

describe('DynamoDBGroupRepository', () => {
  const TABLE_NAME = 'test-share-together-main';
  let repository: DynamoDBGroupRepository;
  let mockDocClient: { send: jest.Mock };

  beforeEach(() => {
    mockDocClient = {
      send: jest.fn(),
    };

    repository = new DynamoDBGroupRepository(
      mockDocClient as unknown as DynamoDBDocumentClient,
      TABLE_NAME
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getById', () => {
    it('グループIDでグループを取得できる', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          PK: 'GROUP#group-1',
          SK: '#META#',
          groupId: 'group-1',
          name: 'テストグループ',
          ownerUserId: 'user-1',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      });

      const result = await repository.getById('group-1');
      const command = mockDocClient.send.mock.calls[0]?.[0] as GetCommand;

      expect(result).toEqual({
        groupId: 'group-1',
        name: 'テストグループ',
        ownerUserId: 'user-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
      expect(command.input).toEqual({
        TableName: TABLE_NAME,
        Key: {
          PK: 'GROUP#group-1',
          SK: '#META#',
        },
      });
    });

    it('グループが存在しない場合はnullを返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Item: undefined });

      const result = await repository.getById('group-404');

      expect(result).toBeNull();
    });
  });
});
