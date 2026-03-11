import { expect, type APIRequestContext } from '@playwright/test';

export const TEST_USER = {
  userId: 'test-user-id',
  email: 'test@example.com',
  name: 'Test User',
  defaultListId: 'list-default',
} as const;

type ResetSeedData = {
  users?: Array<{
    userId: string;
    email: string;
    name: string;
    image?: string;
    defaultListId: string;
  }>;
  groups?: Array<{
    groupId: string;
    name: string;
    ownerUserId: string;
  }>;
  memberships?: Array<{
    groupId: string;
    userId: string;
    role: 'OWNER' | 'MEMBER';
    status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
    invitedBy?: string;
    invitedAt?: string;
    respondedAt?: string;
    ttl?: number;
  }>;
  personalLists?: Array<{
    listId: string;
    userId: string;
    name: string;
    isDefault: boolean;
  }>;
  groupLists?: Array<{
    listId: string;
    groupId: string;
    name: string;
    createdBy: string;
  }>;
  todos?: Array<{
    todoId: string;
    listId: string;
    title: string;
    isCompleted: boolean;
    createdBy: string;
    completedBy?: string;
  }>;
};

export async function resetTestData(
  request: APIRequestContext,
  seedData?: ResetSeedData
): Promise<void> {
  const response = await request.post('/api/test/reset', {
    data: seedData ?? {},
  });
  expect(response.ok()).toBeTruthy();
}
