import { expect, test } from '@playwright/test';
import { resetTestData, TEST_USER } from './helpers/test-data';

const OWNER_USER = TEST_USER;
const MEMBER_USER = {
  userId: 'member-user',
  email: 'member@example.com',
  name: 'テストメンバー',
  defaultListId: 'member-default-list',
} as const;
const INVITEE_USER = {
  userId: 'invitee-user',
  email: 'invitee@example.com',
  name: '招待ユーザー',
  defaultListId: 'invitee-default-list',
} as const;
const OTHER_OWNER_USER = {
  userId: 'other-owner-user',
  email: 'other-owner@example.com',
  name: '別オーナー',
  defaultListId: 'other-owner-default-list',
} as const;

test.describe('グループ管理', () => {
  test.beforeEach(async ({ request }) => {
    await resetTestData(request, {
      users: [OWNER_USER, MEMBER_USER, INVITEE_USER],
      personalLists: [
        {
          listId: OWNER_USER.defaultListId,
          userId: OWNER_USER.userId,
          name: 'デフォルトリスト',
          isDefault: true,
        },
        {
          listId: MEMBER_USER.defaultListId,
          userId: MEMBER_USER.userId,
          name: 'デフォルトリスト',
          isDefault: true,
        },
        {
          listId: INVITEE_USER.defaultListId,
          userId: INVITEE_USER.userId,
          name: 'デフォルトリスト',
          isDefault: true,
        },
      ],
    });
  });

  test('グループを作成できる', async ({ page }) => {
    const createdGroupName = `E2E グループ ${Date.now()}`;
    await page.goto('/groups');
    await page.getByRole('button', { name: 'グループを作成' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: 'グループ名' }).fill(createdGroupName);
    await dialog.getByRole('button', { name: '作成' }).click();

    await expect(page.getByRole('heading', { level: 2, name: createdGroupName })).toBeVisible();
    await expect(page.getByText(`グループ「${createdGroupName}」を作成しました。`)).toBeVisible();
  });

  test('オーナーがメンバー招待を送信できる', async ({ page, request }) => {
    await resetTestData(request, {
      users: [OWNER_USER, MEMBER_USER, INVITEE_USER],
      groups: [{ groupId: 'group-owner', name: 'E2E グループ', ownerUserId: OWNER_USER.userId }],
      memberships: [
        {
          groupId: 'group-owner',
          userId: OWNER_USER.userId,
          role: 'OWNER',
          status: 'ACCEPTED',
          respondedAt: new Date().toISOString(),
        },
      ],
    });

    await page.goto('/groups');
    await page.getByRole('heading', { level: 2, name: 'E2E グループ' }).click();
    await expect(page.getByRole('textbox', { name: 'メールアドレス' })).toBeVisible();
    await page.getByRole('textbox', { name: 'メールアドレス' }).fill('invitee@example.com');
    await page.getByRole('button', { name: '招待を送信' }).click();
    await expect(page.getByText('招待を送信しました。')).toBeVisible();
  });

  test('招待を承認できる', async ({ page, request }) => {
    await resetTestData(request, {
      users: [TEST_USER, OTHER_OWNER_USER],
      groups: [
        {
          groupId: 'group-accept',
          name: '承認テストグループ',
          ownerUserId: OTHER_OWNER_USER.userId,
        },
      ],
      memberships: [
        {
          groupId: 'group-accept',
          userId: OTHER_OWNER_USER.userId,
          role: 'OWNER',
          status: 'ACCEPTED',
          respondedAt: new Date().toISOString(),
        },
        {
          groupId: 'group-accept',
          userId: TEST_USER.userId,
          role: 'MEMBER',
          status: 'PENDING',
          invitedBy: OTHER_OWNER_USER.userId,
          invitedAt: new Date().toISOString(),
        },
      ],
    });

    await page.goto('/invitations');
    await page.getByRole('button', { name: '承認' }).click();
    await expect(page.getByText('「承認テストグループ」への参加を承認しました。')).toBeVisible();
  });

  test('招待を拒否できる', async ({ page, request }) => {
    await resetTestData(request, {
      users: [TEST_USER, OTHER_OWNER_USER],
      groups: [
        {
          groupId: 'group-reject',
          name: '拒否テストグループ',
          ownerUserId: OTHER_OWNER_USER.userId,
        },
      ],
      memberships: [
        {
          groupId: 'group-reject',
          userId: OTHER_OWNER_USER.userId,
          role: 'OWNER',
          status: 'ACCEPTED',
          respondedAt: new Date().toISOString(),
        },
        {
          groupId: 'group-reject',
          userId: TEST_USER.userId,
          role: 'MEMBER',
          status: 'PENDING',
          invitedBy: OTHER_OWNER_USER.userId,
          invitedAt: new Date().toISOString(),
        },
      ],
    });

    await page.goto('/invitations');
    await page.getByRole('button', { name: '拒否' }).click();
    await page.getByRole('dialog').getByRole('button', { name: '拒否' }).click();
    await expect(page.getByText('「拒否テストグループ」への招待を拒否しました。')).toBeVisible();
  });

  test('メンバーがグループから脱退できる', async ({ page, request }) => {
    await resetTestData(request, {
      users: [TEST_USER, OTHER_OWNER_USER],
      groups: [
        {
          groupId: 'group-member',
          name: '参加中グループ',
          ownerUserId: OTHER_OWNER_USER.userId,
        },
      ],
      memberships: [
        {
          groupId: 'group-member',
          userId: OTHER_OWNER_USER.userId,
          role: 'OWNER',
          status: 'ACCEPTED',
          respondedAt: new Date().toISOString(),
        },
        {
          groupId: 'group-member',
          userId: TEST_USER.userId,
          role: 'MEMBER',
          status: 'ACCEPTED',
          invitedBy: OTHER_OWNER_USER.userId,
          invitedAt: new Date().toISOString(),
          respondedAt: new Date().toISOString(),
        },
      ],
    });

    await page.goto('/groups');
    await page.getByRole('heading', { level: 2, name: '参加中グループ' }).click();
    await expect(page.getByRole('button', { name: 'グループを脱退' })).toBeVisible();
    await page.getByRole('button', { name: 'グループを脱退' }).click();
    await page.getByRole('dialog').getByRole('button', { name: '脱退' }).click();
    await expect(page.getByText('グループから脱退しました。')).toBeVisible();
  });

  test('オーナーはグループを削除でき、削除後は関連情報にアクセスできない', async ({
    page,
    request,
  }) => {
    const groupId = 'group-delete-target';
    await resetTestData(request, {
      users: [OWNER_USER, MEMBER_USER],
      groups: [{ groupId, name: '削除対象グループ', ownerUserId: OWNER_USER.userId }],
      memberships: [
        {
          groupId,
          userId: OWNER_USER.userId,
          role: 'OWNER',
          status: 'ACCEPTED',
          respondedAt: new Date().toISOString(),
        },
        {
          groupId,
          userId: MEMBER_USER.userId,
          role: 'MEMBER',
          status: 'ACCEPTED',
          invitedBy: OWNER_USER.userId,
          invitedAt: new Date().toISOString(),
          respondedAt: new Date().toISOString(),
        },
      ],
      groupLists: [{ listId: 'group-list-delete', groupId, name: '共有リスト', createdBy: OWNER_USER.userId }],
      todos: [
        {
          todoId: 'group-todo-delete',
          listId: 'group-list-delete',
          title: '削除される共有ToDo',
          isCompleted: false,
          createdBy: OWNER_USER.userId,
        },
      ],
    });

    await page.goto('/groups');
    await page.getByRole('heading', { level: 2, name: '削除対象グループ' }).click();
    await page.getByRole('button', { name: 'グループを削除' }).click();
    await page.getByRole('dialog').getByRole('button', { name: '削除' }).click();
    await expect(page.getByText('グループを削除しました。')).toBeVisible();

    const groupsResponse = await request.get('/api/groups');
    expect(groupsResponse.ok()).toBeTruthy();
    const groupsData = (await groupsResponse.json()) as {
      data: { groups: Array<{ groupId: string }> };
    };
    expect(groupsData.data.groups.some((group) => group.groupId === groupId)).toBeFalsy();

    const membersResponse = await request.get(`/api/groups/${groupId}/members`);
    expect(membersResponse.status()).toBe(403);
    const listsResponse = await request.get(`/api/groups/${groupId}/lists`);
    expect(listsResponse.status()).toBe(403);
  });

  test('オーナーのみがグループ名を変更できる', async ({ page, request }) => {
    const ownerGroupId = 'group-rename-owner';
    await resetTestData(request, {
      users: [OWNER_USER, OTHER_OWNER_USER],
      groups: [{ groupId: ownerGroupId, name: '更新前グループ名', ownerUserId: OWNER_USER.userId }],
      memberships: [
        {
          groupId: ownerGroupId,
          userId: OWNER_USER.userId,
          role: 'OWNER',
          status: 'ACCEPTED',
          respondedAt: new Date().toISOString(),
        },
      ],
    });
    const ownerUpdateResponse = await request.put(`/api/groups/${ownerGroupId}`, {
      data: { name: '更新後グループ名' },
    });

    expect(ownerUpdateResponse.ok()).toBeTruthy();
    const ownerUpdateData = (await ownerUpdateResponse.json()) as {
      data: { name: string };
    };
    expect(ownerUpdateData.data.name).toBe('更新後グループ名');

    await page.goto('/groups');
    await expect(page.getByText('更新後グループ名')).toBeVisible();

    const nonOwnerGroupId = 'group-rename-non-owner';
    await resetTestData(request, {
      users: [TEST_USER, OTHER_OWNER_USER],
      groups: [{ groupId: nonOwnerGroupId, name: '非オーナー閲覧グループ', ownerUserId: OTHER_OWNER_USER.userId }],
      memberships: [
        {
          groupId: nonOwnerGroupId,
          userId: OTHER_OWNER_USER.userId,
          role: 'OWNER',
          status: 'ACCEPTED',
          respondedAt: new Date().toISOString(),
        },
        {
          groupId: nonOwnerGroupId,
          userId: TEST_USER.userId,
          role: 'MEMBER',
          status: 'ACCEPTED',
          invitedBy: OTHER_OWNER_USER.userId,
          invitedAt: new Date().toISOString(),
          respondedAt: new Date().toISOString(),
        },
      ],
    });

    const nonOwnerUpdateResponse = await request.put(`/api/groups/${nonOwnerGroupId}`, {
      data: { name: '更新不可' },
    });
    expect(nonOwnerUpdateResponse.status()).toBe(403);

    await page.goto('/groups');
    await page.getByRole('heading', { level: 2, name: '非オーナー閲覧グループ' }).click();
    await expect(page.getByRole('button', { name: 'グループを脱退' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'グループを削除' })).toHaveCount(0);
  });

  test('グループオーナーはグループを脱退できない', async ({ page, request }) => {
    await resetTestData(request, {
      users: [OWNER_USER],
      groups: [{ groupId: 'group-owner-cannot-leave', name: 'オーナーグループ', ownerUserId: OWNER_USER.userId }],
      memberships: [
        {
          groupId: 'group-owner-cannot-leave',
          userId: OWNER_USER.userId,
          role: 'OWNER',
          status: 'ACCEPTED',
          respondedAt: new Date().toISOString(),
        },
      ],
    });

    await page.goto('/groups');
    await page.getByRole('heading', { level: 2, name: 'オーナーグループ' }).click();
    await expect(page.getByRole('button', { name: 'グループを脱退' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'グループを削除' })).toBeVisible();
  });

  test('オーナーがメンバーを除外できる', async ({ page, request }) => {
    await resetTestData(request, {
      users: [OWNER_USER, MEMBER_USER],
      groups: [{ groupId: 'group-owner', name: '管理グループ', ownerUserId: OWNER_USER.userId }],
      memberships: [
        {
          groupId: 'group-owner',
          userId: OWNER_USER.userId,
          role: 'OWNER',
          status: 'ACCEPTED',
          respondedAt: new Date().toISOString(),
        },
        {
          groupId: 'group-owner',
          userId: MEMBER_USER.userId,
          role: 'MEMBER',
          status: 'ACCEPTED',
          invitedBy: OWNER_USER.userId,
          invitedAt: new Date().toISOString(),
          respondedAt: new Date().toISOString(),
        },
      ],
    });

    await page.goto('/groups');
    await page.getByRole('heading', { level: 2, name: '管理グループ' }).click();
    await expect(page.getByRole('button', { name: 'テストメンバーを削除' })).toBeVisible();
    await page.getByRole('button', { name: 'テストメンバーを削除' }).click();
    await page.getByRole('dialog').getByRole('button', { name: '削除' }).click();
    await expect(page.getByText('テストメンバーさんをグループから削除しました。')).toBeVisible();
  });
});
