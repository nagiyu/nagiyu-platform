import { expect, test } from '@playwright/test';
import { resetTestData, TEST_USER } from './helpers/test-data';

const GROUP_ID = 'group-shared-e2e';
const LIST_ID = 'group-list-e2e';

test.describe('グループ共有 ToDo 管理', () => {
  test.beforeEach(async ({ request }) => {
    await resetTestData(request, {
      users: [
        TEST_USER,
        {
          userId: 'member-user',
          email: 'member@example.com',
          name: 'メンバー',
          defaultListId: 'member-default',
        },
      ],
      groups: [{ groupId: GROUP_ID, name: 'E2E 共有グループ', ownerUserId: TEST_USER.userId }],
      memberships: [
        {
          groupId: GROUP_ID,
          userId: TEST_USER.userId,
          role: 'OWNER',
          status: 'ACCEPTED',
          respondedAt: new Date().toISOString(),
        },
        {
          groupId: GROUP_ID,
          userId: 'member-user',
          role: 'MEMBER',
          status: 'ACCEPTED',
          invitedBy: TEST_USER.userId,
          invitedAt: new Date().toISOString(),
          respondedAt: new Date().toISOString(),
        },
      ],
      groupLists: [
        { listId: LIST_ID, groupId: GROUP_ID, name: '既存共有リスト', createdBy: TEST_USER.userId },
      ],
      todos: [
        {
          todoId: 'todo-initial',
          listId: LIST_ID,
          title: '既存タスク',
          isCompleted: false,
          createdBy: TEST_USER.userId,
        },
      ],
    });
  });

  test('共有リストを作成できる', async ({ page }) => {
    await page.goto('/groups');
    await page.getByRole('heading', { level: 2, name: 'E2E 共有グループ' }).click();

    const createdListName = `E2E 共有リスト ${Date.now()}`;
    await page.getByRole('textbox', { name: '新しい共有リスト名' }).fill(createdListName);
    await page.getByRole('button', { name: '共有リストを作成' }).click();

    await expect(page.getByText(createdListName)).toBeVisible();
    await expect(page.getByText('共有リストを作成しました。')).toBeVisible();
  });

  test('共有リストに ToDo を追加できる', async ({ page }) => {
    await page.goto(`/lists?scope=shared&groupId=${GROUP_ID}&listId=${LIST_ID}`);
    const todoTitle = `E2E 共有ToDo ${Date.now()}`;
    await page.getByRole('textbox', { name: 'タイトル' }).fill(todoTitle);
    await page.getByRole('button', { name: '追加' }).click();

    await expect(page.getByText(todoTitle)).toBeVisible();
    await expect(page.getByText('ToDoを追加しました。')).toBeVisible();
  });

  test('他メンバーの変更を更新操作で確認できる', async ({ page }) => {
    await page.goto(`/lists?scope=shared&groupId=${GROUP_ID}&listId=${LIST_ID}`);
    await expect(page.getByText('既存タスク')).toBeVisible();
  });

  test('非メンバーはグループ共有ToDoにアクセスできない', async ({ page, request }) => {
    await resetTestData(request, {
      users: [
        TEST_USER,
        {
          userId: 'owner-user',
          email: 'owner@example.com',
          name: 'オーナー',
          defaultListId: 'owner-default',
        },
      ],
      groups: [{ groupId: 'group-private', name: '非公開グループ', ownerUserId: 'owner-user' }],
      memberships: [
        {
          groupId: 'group-private',
          userId: 'owner-user',
          role: 'OWNER',
          status: 'ACCEPTED',
          respondedAt: new Date().toISOString(),
        },
      ],
      groupLists: [
        {
          listId: 'private-list',
          groupId: 'group-private',
          name: '非公開リスト',
          createdBy: 'owner-user',
        },
      ],
    });

    await page.goto('/lists?scope=shared&groupId=group-private&listId=private-list');
    await expect(page.getByText('ToDo一覧の取得に失敗しました。')).toBeVisible();
  });
});
