import type {
  CreateGroupInput,
  CreateGroupListInput,
  CreateGroupMembershipInput,
  CreatePersonalListInput,
  CreateTodoItemInput,
  CreateUserInput,
} from '@nagiyu/share-together-core';
import { NextResponse } from 'next/server';
import { getSessionOrUnauthorized } from '@/lib/auth/session';
import { ERROR_MESSAGES } from '@/lib/constants/errors';
import {
  createGroupRepository,
  createListRepository,
  createMembershipRepository,
  createTodoRepository,
  createUserRepository,
  resetInMemoryRepositories,
} from '@nagiyu/share-together-core';

type ResetSeedData = {
  users?: CreateUserInput[];
  groups?: CreateGroupInput[];
  memberships?: CreateGroupMembershipInput[];
  personalLists?: CreatePersonalListInput[];
  groupLists?: CreateGroupListInput[];
  todos?: CreateTodoItemInput[];
};

function isTestMode(): boolean {
  return process.env.USE_IN_MEMORY_DB === 'true';
}

async function parseSeedData(request: Request): Promise<ResetSeedData> {
  const contentLength = request.headers.get('content-length');
  if (!contentLength || contentLength === '0') {
    return {};
  }

  const body = (await request.json()) as ResetSeedData;
  return body ?? {};
}

async function seedInMemoryData(seedData: ResetSeedData): Promise<void> {
  const userRepository = createUserRepository();
  const groupRepository = createGroupRepository();
  const membershipRepository = createMembershipRepository();
  const listRepository = createListRepository();
  const todoRepository = createTodoRepository();

  for (const user of seedData.users ?? []) {
    await userRepository.create(user);
  }
  for (const group of seedData.groups ?? []) {
    await groupRepository.create(group);
  }
  for (const membership of seedData.memberships ?? []) {
    await membershipRepository.create(membership);
  }
  for (const list of seedData.personalLists ?? []) {
    await listRepository.createPersonalList(list);
  }
  for (const list of seedData.groupLists ?? []) {
    await listRepository.createGroupList(list);
  }
  for (const todo of seedData.todos ?? []) {
    await todoRepository.create(todo);
  }
}

async function handleReset(request?: Request): Promise<NextResponse> {
  if (!isTestMode()) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: ERROR_MESSAGES.NOT_FOUND } },
      { status: 404 }
    );
  }

  const sessionOrUnauthorized = await getSessionOrUnauthorized();
  if ('status' in sessionOrUnauthorized) {
    return sessionOrUnauthorized;
  }

  resetInMemoryRepositories();
  if (request) {
    const seedData = await parseSeedData(request);
    await seedInMemoryData(seedData);
  }

  return NextResponse.json({ data: { success: true } });
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    return await handleReset(request);
  } catch (error) {
    console.error('/api/test/reset POST の実行に失敗しました', { error });
    return NextResponse.json(
      { error: { code: 'INTERNAL_SERVER_ERROR', message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR } },
      { status: 500 }
    );
  }
}

export async function DELETE(): Promise<NextResponse> {
  try {
    return await handleReset();
  } catch (error) {
    console.error('/api/test/reset DELETE の実行に失敗しました', { error });
    return NextResponse.json(
      { error: { code: 'INTERNAL_SERVER_ERROR', message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR } },
      { status: 500 }
    );
  }
}
