import type { User } from '@nagiyu/share-together-core';
import { withAuth } from '@nagiyu/nextjs';
import { NextResponse } from 'next/server';
import type { ApiErrorResponse, UserResponse } from '@/types';
import { getSession } from '@/lib/auth/session';
import { getDocClient } from '@/lib/aws-clients';
import { ERROR_MESSAGES } from '@/lib/constants/errors';
import { createListRepository, createUserRepository } from '@/lib/repositories';

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

export const POST = withAuth(getSession, null, async (session): Promise<NextResponse> => {
  let requestedUserId: string | undefined;
  let operation: 'create' | 'update' | 'unknown' = 'unknown';

  try {
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

    requestedUserId = userId;

    const tableName = process.env.DYNAMODB_TABLE_NAME;
    if (!tableName) {
      throw new Error(ERROR_MESSAGES.DYNAMODB_TABLE_NAME_REQUIRED);
    }

    const docClient = getDocClient();
    const userRepository = createUserRepository(docClient, tableName);
    const listRepository = createListRepository(docClient, tableName);
    const existingUser = await userRepository.getById(userId);

    let responseUser: User;

    if (existingUser) {
      operation = 'update';
      responseUser = await userRepository.update(userId, {
        email,
        name,
        image,
      });
    } else {
      operation = 'create';
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
  } catch (error) {
    console.error('ユーザー登録 API の実行に失敗しました', {
      userId: requestedUserId,
      operation,
      error,
    });
    return createInternalServerErrorResponse();
  }
});
