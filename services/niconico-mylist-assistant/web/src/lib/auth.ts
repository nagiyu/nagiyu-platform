import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

export async function verifyToken(token: string) {
  // Auth プロジェクトの実装を参照
  // トークン検証ロジックを実装
  const response = await docClient.send(
    new GetCommand({
      TableName: process.env.AUTH_TABLE_NAME,
      Key: { PK: `TOKEN#${token}`, SK: 'METADATA' },
    })
  );

  if (!response.Item) {
    throw new Error('Invalid token');
  }

  return {
    id: response.Item.userId,
    email: response.Item.email,
  };
}
