import { type ListRepository, type TodoRepository } from '@nagiyu/share-together-core';
import { NextResponse } from 'next/server';
import type { ApiErrorResponse, TodoResponse, TodosResponse } from '@/types';
import { getSessionOrUnauthorized } from '@/lib/auth/session';
import { getAwsClients } from '@/lib/aws-clients';
import { ERROR_MESSAGES } from '@/lib/constants/errors';
import {
  createListRepository,
  createMembershipRepository,
  createTodoRepository,
} from '@/lib/repositories';

type RouteParams = {
  params: Promise<{ groupId: string; listId: string }>;
};

function createErrorResponse(code: string, message: string, status: number): NextResponse {
  const response: ApiErrorResponse = {
    error: {
      code,
      message,
    },
  };

  return NextResponse.json(response, { status });
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

async function getAuthorizedContext(params: RouteParams['params']): Promise<
  | {
      groupId: string;
      listId: string;
      userId: string;
      listRepository: ListRepository;
      todoRepository: TodoRepository;
    }
  | NextResponse
> {
  const sessionOrUnauthorized = await getSessionOrUnauthorized();
  if ('status' in sessionOrUnauthorized) {
    return sessionOrUnauthorized;
  }

  const { groupId, listId } = await params;
  const userId = sessionOrUnauthorized.user.id;
  if (!isNonEmptyString(groupId) || !isNonEmptyString(listId) || !isNonEmptyString(userId)) {
    return createErrorResponse('VALIDATION_ERROR', ERROR_MESSAGES.VALIDATION_ERROR, 400);
  }

  const tableName = process.env.DYNAMODB_TABLE_NAME;
  if (!tableName) {
    throw new Error(ERROR_MESSAGES.DYNAMODB_TABLE_NAME_REQUIRED);
  }

  const { docClient } = getAwsClients();
  const membershipRepository = createMembershipRepository(docClient, tableName);
  const membership = await membershipRepository.getById(groupId, userId);
  if (!membership || membership.status !== 'ACCEPTED') {
    return createErrorResponse('FORBIDDEN', ERROR_MESSAGES.FORBIDDEN, 403);
  }

  return {
    groupId,
    listId,
    userId,
    listRepository: createListRepository(docClient, tableName),
    todoRepository: createTodoRepository(docClient, tableName),
  };
}

export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  let requestedGroupId: string | undefined;
  let requestedListId: string | undefined;
  try {
    const authorizedContextOrResponse = await getAuthorizedContext(params);
    if ('status' in authorizedContextOrResponse) {
      return authorizedContextOrResponse;
    }

    requestedGroupId = authorizedContextOrResponse.groupId;
    requestedListId = authorizedContextOrResponse.listId;

    const existingList = await authorizedContextOrResponse.listRepository.getGroupListById(
      authorizedContextOrResponse.groupId,
      authorizedContextOrResponse.listId
    );
    if (!existingList) {
      return createErrorResponse('NOT_FOUND', ERROR_MESSAGES.NOT_FOUND, 404);
    }

    const todos = await authorizedContextOrResponse.todoRepository.getByListId(
      authorizedContextOrResponse.listId
    );
    const response: TodosResponse = { data: { todos } };

    return NextResponse.json(response);
  } catch (error) {
    console.error('グループ共有ToDo一覧取得 API の実行に失敗しました', {
      groupId: requestedGroupId,
      listId: requestedListId,
      error,
    });
    return createErrorResponse('INTERNAL_SERVER_ERROR', ERROR_MESSAGES.INTERNAL_SERVER_ERROR, 500);
  }
}

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  let requestedGroupId: string | undefined;
  let requestedListId: string | undefined;
  let requestedUserId: string | undefined;
  try {
    const authorizedContextOrResponse = await getAuthorizedContext(params);
    if ('status' in authorizedContextOrResponse) {
      return authorizedContextOrResponse;
    }

    requestedGroupId = authorizedContextOrResponse.groupId;
    requestedListId = authorizedContextOrResponse.listId;
    requestedUserId = authorizedContextOrResponse.userId;

    const body = (await request.json()) as { title?: unknown };
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (title.length < 1 || title.length > 200) {
      return createErrorResponse('VALIDATION_ERROR', ERROR_MESSAGES.TODO_TITLE_INVALID, 400);
    }

    const existingList = await authorizedContextOrResponse.listRepository.getGroupListById(
      authorizedContextOrResponse.groupId,
      authorizedContextOrResponse.listId
    );
    if (!existingList) {
      return createErrorResponse('NOT_FOUND', ERROR_MESSAGES.NOT_FOUND, 404);
    }

    const todo = await authorizedContextOrResponse.todoRepository.create({
      todoId: crypto.randomUUID(),
      listId: authorizedContextOrResponse.listId,
      title,
      isCompleted: false,
      createdBy: authorizedContextOrResponse.userId,
    });
    const response: TodoResponse = { data: todo };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('グループ共有ToDo作成 API の実行に失敗しました', {
      groupId: requestedGroupId,
      listId: requestedListId,
      userId: requestedUserId,
      error,
    });
    return createErrorResponse('INTERNAL_SERVER_ERROR', ERROR_MESSAGES.INTERNAL_SERVER_ERROR, 500);
  }
}
