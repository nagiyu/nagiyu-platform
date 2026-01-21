import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'ap-northeast-1',
});
const docClient = DynamoDBDocumentClient.from(client);

export async function verifyToken(token: string) {
  if (!process.env.AUTH_TABLE_NAME) {
    throw new Error('AUTH_TABLE_NAME environment variable is not defined');
  }

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
