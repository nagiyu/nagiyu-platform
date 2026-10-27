import type { User } from '@nagiyu/share-together-core';
import { withApiErrorReporting } from '@/lib/api-error-reporting';
import { withAuth } from '@nagiyu/nextjs';
import { NextResponse } from 'next/server';
import type { UserResponse } from '@/types';
import { getSession } from '@/lib/auth/session';
import { getDynamoDBDocumentClient } from '@nagiyu/aws';
import { ERROR_MESSAGES } from '@/lib/constants/errors';
import { createListRepository, createUserRepository } from '@nagiyu/share-together-core';
import { createValidationErrorResponse } from '@/lib/api/responses';

const DEFAULT_LIST_NAME = 'デフォルトリスト';

export const POST = withApiErrorReporting(
  'Web API: ユーザー登録エラー',
  withAuth(getSession, null, async (session): Promise<NextResponse> => {
    const userId = session.user.id;
    const email = session.user.email;
    const name = session.user.name;
    const image = session.user.image ?? undefined;

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

    const tableName = process.env.DYNAMODB_TABLE_NAME;
    if (!tableName) {
      throw new Error(ERROR_MESSAGES.DYNAMODB_TABLE_NAME_REQUIRED);
    }

    const docClient =
      process.env.USE_IN_MEMORY_DB === 'true' ? undefined : getDynamoDBDocumentClient();
    const userRepository = createUserRepository(docClient, tableName);
    const listRepository = createListRepository(docClient, tableName);
    const existingUser = await userRepository.getById(userId);

    let responseUser: User;

    if (existingUser) {
      responseUser = await userRepository.update(userId, {
        email,
        name,
        image,
      });
    } else {
      const defaultListId = crypto.randomUUID();
      responseUser = await userRepository.create({
        userId,
        email,
        name,
        image,
        defaultListId,
      });

      await listRepository.createPersonalList({
        listId: defaultListId,
        userId,
        name: DEFAULT_LIST_NAME,
        isDefault: true,
      });
    }

    const response: UserResponse = { data: responseUser };
    return NextResponse.json(response);
  })
);
