import { expect, test } from '@playwright/test';
import { resetTestData, TEST_USER } from './helpers/test-data';

const createPersonalListByPrompt = async (page: import('@playwright/test').Page, name: string) => {
  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('prompt');
    await dialog.accept(name);
  });
  await page.getByRole('button', { name: '個人リストを作成' }).click();
  await expect(page.getByText('個人リストを作成しました。')).toBeVisible();
};

const createPersonalLists = (totalCount: number) => {
  return Array.from({ length: totalCount }, (_, index) => {
    if (index === 0) {
      return {
        listId: 'list-default',
        userId: TEST_USER.userId,
        name: 'デフォルトリスト',
        isDefault: true,
      };
    }

    return {
      listId: `list-${index.toString().padStart(3, '0')}`,
      userId: TEST_USER.userId,
      name: `追加リスト${index}`,
      isDefault: false,
    };
  });
};

test.describe('個人リスト管理', () => {
  test.beforeEach(async ({ page, request }) => {
    await resetTestData(request, {
      users: [TEST_USER],
      personalLists: [
        {
          listId: 'list-default',
          userId: TEST_USER.userId,
          name: 'デフォルトリスト',
          isDefault: true,
        },
        {
          listId: 'list-work',
          userId: TEST_USER.userId,
          name: '仕事リスト',
          isDefault: false,
        },
      ],
    });

    await page.goto('/lists?listId=list-default');
    await expect(page.getByRole('button', { name: '個人リストを作成' })).toBeVisible();
  });

  test('個人リストを作成できる', async ({ page }) => {
    await createPersonalListByPrompt(page, '旅行リスト');
    await expect(page.getByText('旅行リスト')).toBeVisible();
  });

  test('個人リストを切り替えできる', async ({ page }) => {
    await page.getByRole('button', { name: '仕事リスト' }).first().click();
    await expect(page.getByRole('button', { name: '仕事リスト' }).first()).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  test('個人リスト名を変更できる', async ({ page }) => {
    page.once('dialog', async (dialog) => {
      expect(dialog.type()).toBe('prompt');
      await dialog.accept('仕事（更新）');
    });

    await page.getByRole('button', { name: '仕事リストを編集' }).first().click();
    await expect(page.getByText('仕事（更新）')).toBeVisible();
    await expect(page.getByText('個人リスト名を更新しました。')).toBeVisible();
  });

  test('デフォルト以外の個人リストを削除できる', async ({ page }) => {
    page.once('dialog', async (dialog) => {
      expect(dialog.type()).toBe('confirm');
      await dialog.accept();
    });

    await page.getByRole('button', { name: '仕事リストを削除' }).first().click();
    await expect(page.getByText('個人リストを削除しました。')).toBeVisible();
  });

  test('デフォルトリストは削除できない', async ({ page }) => {
    const defaultDeleteButton = page.getByRole('button', { name: 'デフォルトリストを削除' });
    const count = await defaultDeleteButton.count();
    if (count > 0) {
      await expect(defaultDeleteButton).toBeDisabled();
      return;
    }

    await expect(defaultDeleteButton).toHaveCount(0);
  });

  test('他ユーザーの個人リストにはアクセスできない', async ({ page, request }) => {
    await resetTestData(request, {
      users: [
        TEST_USER,
        {
          userId: 'other-user-id',
          email: 'other-user@example.com',
          name: 'Other User',
          defaultListId: 'other-default-list',
        },
      ],
      personalLists: [
        {
          listId: 'list-default',
          userId: TEST_USER.userId,
          name: 'デフォルトリスト',
          isDefault: true,
        },
        {
          listId: 'other-default-list',
          userId: 'other-user-id',
          name: '他ユーザーのリスト',
          isDefault: true,
        },
      ],
      todos: [
        {
          todoId: 'other-secret-todo',
          listId: 'other-default-list',
          title: '他ユーザー専用ToDo',
          isCompleted: false,
          createdBy: 'other-user-id',
        },
      ],
    });

    const forbiddenResponse = await request.put(
      '/api/lists/other-default-list/todos/other-secret-todo',
      {
        data: { isCompleted: true },
      }
    );
    expect(forbiddenResponse.status()).toBe(403);

    await page.goto('/lists?listId=other-default-list');
    await expect(page.getByText('ToDo一覧の取得に失敗しました。')).toBeVisible();
    await expect(page.getByText('他ユーザー専用ToDo')).toHaveCount(0);
  });

  test('個人リストが100件に到達している場合は作成ボタンが無効化される', async ({
    page,
    request,
  }) => {
    await resetTestData(request, {
      users: [TEST_USER],
      personalLists: createPersonalLists(100),
    });

    await page.goto('/lists?listId=list-default');
    await expect(page.getByRole('button', { name: '個人リストを作成' })).toBeDisabled();
    await expect(page.getByText('個人リストは100件まで作成できます')).toBeVisible();
  });

  test('個人リスト作成 API が 409 を返した場合にエラーメッセージが表示される', async ({
    page,
    request,
  }) => {
    await resetTestData(request, {
      users: [TEST_USER],
      personalLists: createPersonalLists(2),
    });

    await page.goto('/lists?listId=list-default');
    await expect(page.getByRole('button', { name: '個人リストを作成' })).toBeEnabled();

    await resetTestData(request, {
      users: [TEST_USER],
      personalLists: createPersonalLists(100),
    });

    page.once('dialog', async (dialog) => {
      expect(dialog.type()).toBe('prompt');
      await dialog.accept('追加できないリスト');
    });

    const createListResponsePromise = page.waitForResponse(
      (response) => response.request().method() === 'POST' && response.url().endsWith('/api/lists')
    );
    await page.getByRole('button', { name: '個人リストを作成' }).evaluate((button) => {
      if (!(button instanceof HTMLButtonElement)) {
        throw new Error('個人リスト作成ボタンが見つかりません');
      }
      button.disabled = false;
      button.click();
    });
    const createListResponse = await createListResponsePromise;
    expect(createListResponse.status()).toBe(409);
    await expect(
      page.getByRole('alert').filter({ hasText: '個人リストは100件まで作成できます' })
    ).toBeVisible();
  });

  test('共有から個人へ表示範囲を戻しても個人ToDo取得エラーにならない', async ({
    page,
    request,
  }) => {
    await resetTestData(request, {
      users: [
        TEST_USER,
        {
          userId: 'shared-member',
          email: 'shared-member@example.com',
          name: 'Shared Member',
          defaultListId: 'shared-member-default',
        },
      ],
      personalLists: [
        {
          listId: 'list-default',
          userId: TEST_USER.userId,
          name: 'デフォルトリスト',
          isDefault: true,
        },
      ],
      groups: [
        {
          groupId: 'scope-switch-group',
          name: 'スコープ切り替え検証',
          ownerUserId: TEST_USER.userId,
        },
      ],
      memberships: [
        {
          groupId: 'scope-switch-group',
          userId: TEST_USER.userId,
          role: 'OWNER',
          status: 'ACCEPTED',
          respondedAt: new Date().toISOString(),
        },
        {
          groupId: 'scope-switch-group',
          userId: 'shared-member',
          role: 'MEMBER',
          status: 'ACCEPTED',
          invitedBy: TEST_USER.userId,
          invitedAt: new Date().toISOString(),
          respondedAt: new Date().toISOString(),
        },
      ],
      groupLists: [
        {
          listId: 'scope-shared-list',
          groupId: 'scope-switch-group',
          name: '共有検証リスト',
          createdBy: TEST_USER.userId,
        },
      ],
      todos: [
        {
          todoId: 'todo-personal-scope',
          listId: 'list-default',
          title: '個人スコープToDo',
          isCompleted: false,
          createdBy: TEST_USER.userId,
        },
        {
          todoId: 'todo-shared-scope',
          listId: 'scope-shared-list',
          title: '共有スコープToDo',
          isCompleted: false,
          createdBy: TEST_USER.userId,
        },
      ],
    });

    await page.goto('/lists?listId=list-default');
    await expect(page.getByText('個人スコープToDo')).toBeVisible();

    const scopeSelect = page.getByRole('combobox', { name: '表示範囲' }).first();

    await scopeSelect.click();
    await page.getByRole('option', { name: '共有' }).click();
    await expect(page.getByText('共有スコープToDo')).toBeVisible();

    await scopeSelect.click();
    await page.getByRole('option', { name: '個人' }).click();
    await expect(page.getByText('個人スコープToDo')).toBeVisible();
    await expect(page.getByText('ToDo一覧の取得に失敗しました。')).not.toBeVisible();
  });
});
