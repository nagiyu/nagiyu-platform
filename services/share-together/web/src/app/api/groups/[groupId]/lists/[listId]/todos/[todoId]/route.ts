import { type ListRepository, TodoService } from '@nagiyu/share-together-core';
import { NextResponse } from 'next/server';
import type { TodoResponse } from '@/types';
import { getAuthorizedGroupContext } from '@/lib/api/authorization';
import { ERROR_MESSAGES } from '@/lib/constants/errors';
import { createListRepository, createTodoRepository } from '@nagiyu/share-together-core';
import {
  createValidationErrorResponse,
  createNotFoundErrorResponse,
  createInternalServerErrorResponse,
} from '@/lib/api/responses';
import { isValidationError, isNotFoundError } from '@/lib/api/validation';

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

async function getAuthorizedContext(params: RouteParams['params']): Promise<
  | {
      groupId: string;
      listId: string;
      todoId: string;
      userId: string;
      listRepository: ListRepository;
      todoService: TodoService;
    }
  | NextResponse
> {
  const contextOrResponse = await getAuthorizedGroupContext(params);
  if ('status' in contextOrResponse) {
    return contextOrResponse;
  }

  const { groupId, listId, todoId, userId, docClient, tableName } = contextOrResponse;
  return {
    groupId,
    listId,
    todoId,
    userId,
    listRepository: createListRepository(docClient, tableName),
    todoService: new TodoService(createTodoRepository(docClient, tableName)),
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
      return createValidationErrorResponse();
    }

    const existingList = await authorizedContextOrResponse.listRepository.getGroupListById(
      authorizedContextOrResponse.groupId,
      authorizedContextOrResponse.listId
    );
    if (!existingList) {
      return createNotFoundErrorResponse();
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
    if (isValidationError(error, VALIDATION_ERROR_MESSAGES) || error instanceof SyntaxError) {
      return createValidationErrorResponse();
    }
    if (isNotFoundError(error, NOT_FOUND_ERROR_MESSAGES)) {
      return createNotFoundErrorResponse();
    }

    console.error('グループ共有ToDo更新 API の実行に失敗しました', {
      groupId: requestedGroupId,
      listId: requestedListId,
      todoId: requestedTodoId,
      userId: requestedUserId,
      error,
    });
    return createInternalServerErrorResponse();
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
      return createNotFoundErrorResponse();
    }

    await authorizedContextOrResponse.todoService.deleteTodo(
      authorizedContextOrResponse.listId,
      authorizedContextOrResponse.todoId
    );
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (isValidationError(error, VALIDATION_ERROR_MESSAGES)) {
      return createValidationErrorResponse();
    }
    if (isNotFoundError(error, NOT_FOUND_ERROR_MESSAGES)) {
      return createNotFoundErrorResponse();
    }

    console.error('グループ共有ToDo削除 API の実行に失敗しました', {
      groupId: requestedGroupId,
      listId: requestedListId,
      todoId: requestedTodoId,
      error,
    });
    return createInternalServerErrorResponse();
  }
}
