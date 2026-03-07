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
  // Service WorkerがFetchを先に処理してpage.route()モックをバイパスするのを防ぐため、Service Workerをブロックする
  test.use({ serviceWorkers: 'block' });

  test.beforeEach(async ({ page }) => {
    await page.route(/\/api\/invitations(?:\/)?(?:\?.*)?$/, async (route) => {
      await route.fulfill({ json: { data: { invitations: [] } } });
    });
    await page.route(
      (url) => new URL(url.toString()).pathname.startsWith('/api/users'),
      async (route) => {
        await route.fulfill({ status: 201, json: { data: { success: true } } });
      }
    );
    await page.route(
      (url) => new URL(url.toString()).pathname.startsWith('/api/auth/session'),
      async (route) => {
        await route.fulfill({ json: { user: { id: 'owner-user' } } });
      }
    );
  });

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
  await page.route(
    (url) => new URL(url.toString()).pathname.startsWith('/api/groups'),
    async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === '/api/groups' || pathname === '/api/groups/') {
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
        return;
      }

      if (/^\/api\/groups\/[^/]+\/members\/?$/.test(pathname)) {
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
        return;
      }

      if (/^\/api\/groups\/[^/]+\/lists\/?$/.test(pathname)) {
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
        return;
      }

      await route.continue();
    }
  );
}

async function setupGroupTodosRoutes(page: Page, options: { todos: Todo[] }) {
  await page.route(
    (url) => new URL(url.toString()).pathname.startsWith('/api/groups'),
    async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === '/api/groups' || pathname === '/api/groups/') {
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
        return;
      }

      if (/^\/api\/groups\/[^/]+\/lists\/?$/.test(pathname)) {
        await route.fulfill({
          json: {
            data: {
              lists: [{ listId: LIST_ID, name: '既存共有リスト' }],
            },
          },
        });
        return;
      }

      await route.continue();
    }
  );

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
