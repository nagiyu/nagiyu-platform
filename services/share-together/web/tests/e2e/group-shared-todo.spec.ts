import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

type GroupList = {
  listId: string;
  name: string;
};

type Todo = {
  todoId: string;
  title: string;
  isCompleted: boolean;
};

const GROUP_ID = 'group-shared-e2e';
const LIST_ID = 'group-list-e2e';
const GROUP_TODOS_ROUTE = /\/api\/groups\/[^/]+\/lists\/[^/]+\/todos\/?(?:\?.*)?$/;

test.describe('グループ共有 ToDo 管理', () => {
  test('共有リストを作成できる', async ({ page }) => {
    const lists: GroupList[] = [{ listId: LIST_ID, name: '既存共有リスト' }];

    await setupGroupDetailRoutes(page, { lists });
    await page.goto('/groups');
    await expect(page.getByRole('heading', { level: 1, name: 'グループ' })).toBeVisible();
    await page.getByRole('heading', { level: 2, name: 'E2E 共有グループ' }).click();
    await expect(page.getByRole('heading', { level: 2, name: '共有リスト' })).toBeVisible();

    const createdListName = `E2E 共有リスト ${Date.now()}`;
    await page.getByRole('textbox', { name: '新しい共有リスト名' }).fill(createdListName);
    await page.getByRole('button', { name: '共有リストを作成' }).click();

    await expect(page.getByText(createdListName)).toBeVisible();
    await expect(page.getByText('共有リストを作成しました。')).toBeVisible();
  });

  test('共有リストに ToDo を追加できる', async ({ page }) => {
    const todos: Todo[] = [{ todoId: 'todo-initial', title: '既存タスク', isCompleted: false }];

    await setupGroupTodosRoutes(page, { todos });
    await page.goto(`/lists?scope=shared&groupId=${GROUP_ID}&listId=${LIST_ID}`);
    await expect(page.getByRole('heading', { level: 2, name: 'ToDo' })).toBeVisible();

    const todoTitle = `E2E 共有ToDo ${Date.now()}`;
    await page.getByRole('textbox', { name: 'タイトル' }).fill(todoTitle);
    await page.getByRole('button', { name: '追加' }).click();

    await expect(page.getByText(todoTitle)).toBeVisible();
    await expect(page.getByText('ToDoを追加しました。')).toBeVisible();
  });

  test('他メンバーの変更を更新操作で確認できる', async ({ page }) => {
    const sharedTodoTitle = '会議用の議題を共有する';
    await setupGroupTodosRoutes(page, {
      todos: [{ todoId: 'todo-shared', title: sharedTodoTitle, isCompleted: false }],
    });
    await page.goto(`/lists?scope=shared&groupId=${GROUP_ID}&listId=${LIST_ID}`);

    await expect(page.getByText(sharedTodoTitle)).toBeVisible();
    await Promise.all([
      page.waitForRequest(
        (request) =>
          request.method() === 'GET' &&
          request.url().includes(`/groups/${GROUP_ID}/lists/${LIST_ID}/todos`)
      ),
      page.getByRole('button', { name: '更新' }).click(),
    ]);

    await expect(page.getByRole('heading', { level: 2, name: 'ToDo' })).toBeVisible();
    await expect(page.getByText(sharedTodoTitle)).toBeVisible();
  });

  test('非メンバーはグループにアクセスできない', async ({ page }) => {
    await page.route(/\/api\/groups(?:\/)?(?:\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 403,
        json: {
          error: {
            code: 'FORBIDDEN',
            message: 'このグループにアクセスする権限がありません。',
          },
        },
      });
    });
    await page.goto('/groups');

    await expect(page.getByText('グループ一覧の取得に失敗しました。')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'メンバー一覧' })).not.toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: '共有リスト' })).not.toBeVisible();
  });
});

async function setupGroupDetailRoutes(page: Page, options: { lists: GroupList[] }) {
  await page.route(/\/api\/groups(?:\/)?(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      json: {
        data: {
          groups: [
            {
              groupId: GROUP_ID,
              name: 'E2E 共有グループ',
              ownerUserId: 'owner-user',
              isOwner: true,
            },
          ],
        },
      },
    });
  });

  await page.route(/\/api\/groups\/[^/]+\/members(?:\/)?(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      json: {
        data: {
          members: [
            { userId: 'owner-user', name: 'オーナー' },
            { userId: 'member-user', name: 'メンバー' },
          ],
        },
      },
    });
  });

  await page.route(/\/api\/groups\/[^/]+\/lists(?:\/)?(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as { name: string };
      const created: GroupList = {
        listId: `group-list-${Date.now()}`,
        name: body.name,
      };
      options.lists.push(created);
      await route.fulfill({ status: 201, json: { data: created } });
      return;
    }

    await route.fulfill({ json: { data: { lists: options.lists } } });
  });

  await page.route(/\/api\/auth\/session(?:\/.*)?(?:\?.*)?$/, async (route) => {
    await route.fulfill({ json: { user: { id: 'owner-user' } } });
  });
}

async function setupGroupTodosRoutes(page: Page, options: { todos: Todo[] }) {
  await page.route(/\/api\/groups(?:\/)?(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      json: {
        data: {
          groups: [
            {
              groupId: GROUP_ID,
              name: 'E2E 共有グループ',
              ownerUserId: 'owner-user',
              isOwner: true,
            },
          ],
        },
      },
    });
  });
  await page.route(/\/api\/groups\/[^/]+\/lists(?:\/)?(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      json: {
        data: {
          lists: [{ listId: LIST_ID, name: '既存共有リスト' }],
        },
      },
    });
  });

  await page.route(GROUP_TODOS_ROUTE, async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as { title: string };
      const createdTodo: Todo = {
        todoId: `todo-${Date.now()}`,
        title: body.title,
        isCompleted: false,
      };
      options.todos.push(createdTodo);
      await route.fulfill({ status: 201, json: { data: createdTodo } });
      return;
    }

    await route.fulfill({ json: { data: { todos: options.todos } } });
  });
}
