/**
 * Unit tests for aws-clients
 */

describe('aws-clients', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  describe('getDynamoDBDocumentClient', () => {
    it('DynamoDB Document Client のシングルトンインスタンスを返す', async () => {
      // Arrange
      const mockClient = { mock: 'client' };
      const mockDocClient = { mock: 'docClient' };

      // モジュールをモック化
      jest.mock('@aws-sdk/client-dynamodb', () => ({
        DynamoDBClient: jest.fn(() => mockClient),
      }));

      jest.mock('@aws-sdk/lib-dynamodb', () => ({
        DynamoDBDocumentClient: {
          from: jest.fn(() => mockDocClient),
        },
      }));

      // Act
      const { getDynamoDBDocumentClient } = await import('../../../src/lib/aws-clients.js');
      const client1 = getDynamoDBDocumentClient();
      const client2 = getDynamoDBDocumentClient();

      // Assert
      expect(client1).toBe(client2); // 同じインスタンスを返す
    });

    it('環境変数がない場合、デフォルトのリージョンで動作する', async () => {
      // Arrange
      delete process.env.AWS_REGION;

      // Act
      const { getDynamoDBDocumentClient } = await import('../../../src/lib/aws-clients.js');
      const client = getDynamoDBDocumentClient();

      // Assert
      expect(client).toBeDefined();
    });
  });

  describe('getTableName', () => {
    it('環境変数 DYNAMODB_TABLE_NAME が設定されている場合、それを返す', async () => {
      // Arrange
      process.env.DYNAMODB_TABLE_NAME = 'test-table-name';

      // Act
      const { getTableName } = await import('../../../src/lib/aws-clients.js');
      const tableName = getTableName();

      // Assert
      expect(tableName).toBe('test-table-name');

      delete process.env.DYNAMODB_TABLE_NAME;
    });

    it('環境変数 DYNAMODB_TABLE_NAME が未設定の場合、エラーをスローする', async () => {
      // Arrange
      delete process.env.DYNAMODB_TABLE_NAME;

      // Act & Assert
      const { getTableName } = await import('../../../src/lib/aws-clients.js');
      expect(() => getTableName()).toThrow('環境変数 DYNAMODB_TABLE_NAME が設定されていません');
    });
  });
});
