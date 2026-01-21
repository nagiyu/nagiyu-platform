import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, TABLE_NAME } from './client';
import type { User } from '../types';

export async function createUser(user: User): Promise<void> {
  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: `USER#${user.userId}`,
      SK: 'METADATA',
      GSI1PK: 'USER',
      GSI1SK: user.userId,
      ...user,
    },
    ConditionExpression: 'attribute_not_exists(PK)',
  }));
}

export async function getUser(userId: string): Promise<User | null> {
  const result = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: {
      PK: `USER#${userId}`,
      SK: 'METADATA',
    },
  }));

  if (!result.Item) return null;

  const { PK, SK, GSI1PK, GSI1SK, ...user } = result.Item;
  return user as User;
}
