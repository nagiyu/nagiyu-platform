import { PutCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBUserRepository, type User } from '@nagiyu/share-together-core';
import { NextResponse } from 'next/server';
import type { ApiErrorResponse, UserResponse } from '@/types';
import { getSessionOrUnauthorized } from '@/lib/auth/session';
import { getAwsClients } from '@/lib/aws-clients';
import { ERROR_MESSAGES } from '@/lib/constants/errors';

const USER_META_SK = '#META#';
const DEFAULT_LIST_NAME = 'デフォルトリスト';

function createValidationErrorResponse(): NextResponse {
  const response: ApiErrorResponse = {
    error: {
      code: 'VALIDATION_ERROR',
      message: ERROR_MESSAGES.VALIDATION_ERROR,
    },
  };

  return NextResponse.json(response, { status: 400 });
}

function createInternalServerErrorResponse(): NextResponse {
  const response: ApiErrorResponse = {
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
    },
  };

  return NextResponse.json(response, { status: 500 });
}

export async function POST(): Promise<NextResponse> {
  let requestedUserId: string | undefined;
  let operation: 'create' | 'update' | 'unknown' = 'unknown';

  try {
    const sessionOrUnauthorized = await getSessionOrUnauthorized();
    if ('status' in sessionOrUnauthorized) {
      return sessionOrUnauthorized;
    }

    const userId = sessionOrUnauthorized.user.id;
    const email = sessionOrUnauthorized.user.email;
    const name = sessionOrUnauthorized.user.name;
    const image = sessionOrUnauthorized.user.image ?? undefined;

    if (
      typeof userId !== 'string' ||
      userId.length === 0 ||
      typeof email !== 'string' ||
      email.length === 0 ||
      typeof name !== 'string' ||
      name.length === 0
    ) {
      return createValidationErrorResponse();
    }

    requestedUserId = userId;

    const tableName = process.env.DYNAMODB_TABLE_NAME;
    if (!tableName) {
      throw new Error('DYNAMODB_TABLE_NAME is required');
    }

    const { docClient } = getAwsClients();
    const userRepository = new DynamoDBUserRepository(docClient, tableName);
    const existingUser = await userRepository.getById(userId);
    const now = new Date().toISOString();

    let responseUser: User;

    if (existingUser) {
      operation = 'update';
      responseUser = {
        ...existingUser,
        email,
        name,
        image,
        updatedAt: now,
      };

      await docClient.send(
        new PutCommand({
          TableName: tableName,
          Item: {
            PK: `USER#${responseUser.userId}`,
            SK: USER_META_SK,
            GSI2PK: `EMAIL#${responseUser.email}`,
            ...responseUser,
          },
        })
      );
    } else {
      operation = 'create';
      const defaultListId = crypto.randomUUID();
      responseUser = {
        userId,
        email,
        name,
        image,
        defaultListId,
        createdAt: now,
        updatedAt: now,
      };

      await docClient.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: tableName,
                Item: {
                  PK: `USER#${userId}`,
                  SK: USER_META_SK,
                  GSI2PK: `EMAIL#${email}`,
                  ...responseUser,
                },
                ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
              },
            },
            {
              Put: {
                TableName: tableName,
                Item: {
                  PK: `USER#${userId}`,
                  SK: `PLIST#${defaultListId}`,
                  listId: defaultListId,
                  userId,
                  name: DEFAULT_LIST_NAME,
                  isDefault: true,
                  createdAt: now,
                  updatedAt: now,
                },
                ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
              },
            },
          ],
        })
      );
    }

    const response: UserResponse = { data: responseUser };
    return NextResponse.json(response);
  } catch (error) {
    console.error('ユーザー登録 API の実行に失敗しました', {
      userId: requestedUserId,
      operation,
      error,
    });
    return createInternalServerErrorResponse();
  }
}
