import {
  DynamoDBListRepository,
  DynamoDBMembershipRepository,
  DynamoDBTodoRepository,
  TodoService,
} from '@nagiyu/share-together-core';
import { NextResponse } from 'next/server';
import type { ApiErrorResponse, TodoResponse } from '@/types';
import { getSessionOrUnauthorized } from '@/lib/auth/session';
import { getAwsClients } from '@/lib/aws-clients';
import { ERROR_MESSAGES } from '@/lib/constants/errors';

interface TodoRouteParams {
  groupId: string;
  listId: string;
  todoId: string;
}

interface RouteParams {
  params: Promise<TodoRouteParams>;
}

interface UpdateTodoRequestBody {
  title?: unknown;
  isCompleted?: unknown;
}

const VALIDATION_ERROR_MESSAGES: Set<string> = new Set([
  ERROR_MESSAGES.USER_ID_REQUIRED,
  ERROR_MESSAGES.LIST_ID_REQUIRED,
  ERROR_MESSAGES.TODO_ID_REQUIRED,
  ERROR_MESSAGES.TODO_TITLE_INVALID,
  ERROR_MESSAGES.UPDATE_FIELDS_REQUIRED,
]);

const NOT_FOUND_ERROR_MESSAGES: Set<string> = new Set([ERROR_MESSAGES.TODO_NOT_FOUND]);

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

function parseUpdateBody(
  body: UpdateTodoRequestBody
): { title?: string; isCompleted?: boolean } | null {
  const updates: { title?: string; isCompleted?: boolean } = {};

  if (body.title !== undefined) {
    if (typeof body.title !== 'string') {
      return null;
    }
    updates.title = body.title;
  }

  if (body.isCompleted !== undefined) {
    if (typeof body.isCompleted !== 'boolean') {
      return null;
    }
    updates.isCompleted = body.isCompleted;
  }

  return updates;
}

function isValidationError(error: unknown): boolean {
  return error instanceof Error && VALIDATION_ERROR_MESSAGES.has(error.message);
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && NOT_FOUND_ERROR_MESSAGES.has(error.message);
}

async function getAuthorizedContext(params: RouteParams['params']): Promise<
  | {
      groupId: string;
      listId: string;
      todoId: string;
      userId: string;
      listRepository: DynamoDBListRepository;
      todoService: TodoService;
    }
  | NextResponse
> {
  const sessionOrUnauthorized = await getSessionOrUnauthorized();
  if ('status' in sessionOrUnauthorized) {
    return sessionOrUnauthorized;
  }

  const { groupId, listId, todoId } = await params;
  const userId = sessionOrUnauthorized.user.id;
  if (
    !isNonEmptyString(groupId) ||
    !isNonEmptyString(listId) ||
    !isNonEmptyString(todoId) ||
    !isNonEmptyString(userId)
  ) {
    return createErrorResponse('VALIDATION_ERROR', ERROR_MESSAGES.VALIDATION_ERROR, 400);
  }

  const tableName = process.env.DYNAMODB_TABLE_NAME;
  if (!tableName) {
    throw new Error(ERROR_MESSAGES.DYNAMODB_TABLE_NAME_REQUIRED);
  }

  const { docClient } = getAwsClients();
  const membershipRepository = new DynamoDBMembershipRepository(docClient, tableName);
  const membership = await membershipRepository.getById(groupId, userId);
  if (!membership || membership.status !== 'ACCEPTED') {
    return createErrorResponse('FORBIDDEN', ERROR_MESSAGES.FORBIDDEN, 403);
  }

  const todoRepository = new DynamoDBTodoRepository(docClient, tableName);

  return {
    groupId,
    listId,
    todoId,
    userId,
    listRepository: new DynamoDBListRepository(docClient, tableName),
    todoService: new TodoService(todoRepository),
  };
}

export async function PUT(request: Request, { params }: RouteParams): Promise<NextResponse> {
  let requestedGroupId: string | undefined;
  let requestedListId: string | undefined;
  let requestedTodoId: string | undefined;
  let requestedUserId: string | undefined;

  try {
    const authorizedContextOrResponse = await getAuthorizedContext(params);
    if ('status' in authorizedContextOrResponse) {
      return authorizedContextOrResponse;
    }

    requestedGroupId = authorizedContextOrResponse.groupId;
    requestedListId = authorizedContextOrResponse.listId;
    requestedTodoId = authorizedContextOrResponse.todoId;
    requestedUserId = authorizedContextOrResponse.userId;

    const body = (await request.json()) as UpdateTodoRequestBody;
    const updates = parseUpdateBody(body);
    if (!updates) {
      return createErrorResponse('VALIDATION_ERROR', ERROR_MESSAGES.VALIDATION_ERROR, 400);
    }

    const existingList = await authorizedContextOrResponse.listRepository.getGroupListById(
      authorizedContextOrResponse.groupId,
      authorizedContextOrResponse.listId
    );
    if (!existingList) {
      return createErrorResponse('NOT_FOUND', ERROR_MESSAGES.NOT_FOUND, 404);
    }

    const todo = await authorizedContextOrResponse.todoService.updateTodo(
      authorizedContextOrResponse.listId,
      authorizedContextOrResponse.todoId,
      updates,
      authorizedContextOrResponse.userId
    );

    const response: TodoResponse = { data: todo };
    return NextResponse.json(response);
  } catch (error) {
    if (isValidationError(error) || error instanceof SyntaxError) {
      return createErrorResponse('VALIDATION_ERROR', ERROR_MESSAGES.VALIDATION_ERROR, 400);
    }
    if (isNotFoundError(error)) {
      return createErrorResponse('NOT_FOUND', ERROR_MESSAGES.NOT_FOUND, 404);
    }

    console.error('グループ共有ToDo更新 API の実行に失敗しました', {
      groupId: requestedGroupId,
      listId: requestedListId,
      todoId: requestedTodoId,
      userId: requestedUserId,
      error,
    });
    return createErrorResponse('INTERNAL_SERVER_ERROR', ERROR_MESSAGES.INTERNAL_SERVER_ERROR, 500);
  }
}

export async function DELETE(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  let requestedGroupId: string | undefined;
  let requestedListId: string | undefined;
  let requestedTodoId: string | undefined;

  try {
    const authorizedContextOrResponse = await getAuthorizedContext(params);
    if ('status' in authorizedContextOrResponse) {
      return authorizedContextOrResponse;
    }

    requestedGroupId = authorizedContextOrResponse.groupId;
    requestedListId = authorizedContextOrResponse.listId;
    requestedTodoId = authorizedContextOrResponse.todoId;

    const existingList = await authorizedContextOrResponse.listRepository.getGroupListById(
      authorizedContextOrResponse.groupId,
      authorizedContextOrResponse.listId
    );
    if (!existingList) {
      return createErrorResponse('NOT_FOUND', ERROR_MESSAGES.NOT_FOUND, 404);
    }

    await authorizedContextOrResponse.todoService.deleteTodo(
      authorizedContextOrResponse.listId,
      authorizedContextOrResponse.todoId
    );
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (isValidationError(error)) {
      return createErrorResponse('VALIDATION_ERROR', ERROR_MESSAGES.VALIDATION_ERROR, 400);
    }
    if (isNotFoundError(error)) {
      return createErrorResponse('NOT_FOUND', ERROR_MESSAGES.NOT_FOUND, 404);
    }

    console.error('グループ共有ToDo削除 API の実行に失敗しました', {
      groupId: requestedGroupId,
      listId: requestedListId,
      todoId: requestedTodoId,
      error,
    });
    return createErrorResponse('INTERNAL_SERVER_ERROR', ERROR_MESSAGES.INTERNAL_SERVER_ERROR, 500);
  }
}
