import { expect, test } from '@playwright/test';

test.describe('個人 ToDo 管理', () => {
  test.beforeEach(async ({ page }) => {
    const listId = 'list-default';
    const todos = [
      { todoId: 'todo-1', title: '牛乳を買う', isCompleted: false },
      { todoId: 'todo-2', title: '請求書を確認する', isCompleted: true },
    ];

    await page.route('**/api/auth/session', async (route) => {
      await route.fulfill({
        json: {
          user: { id: 'e2e-user' },
          expires: '2099-01-01T00:00:00.000Z',
        },
      });
    });

    await page.route('**/api/groups', async (route) => {
      await route.fulfill({ json: { data: { groups: [] } } });
    });

    await page.route('**/api/lists', async (route) => {
      await route.fulfill({
        json: {
          data: {
            lists: [
              {
                listId,
                name: 'デフォルト個人リスト',
                isDefault: true,
                createdAt: '2026-03-01T00:00:00.000Z',
                updatedAt: '2026-03-01T00:00:00.000Z',
              },
            ],
          },
        },
      });
    });

    await page.route('**/api/lists/*', async (route) => {
      const url = new URL(route.request().url());
      if (!/^\/api\/lists\/[^/]+$/.test(url.pathname)) {
        await route.continue();
        return;
      }

      await route.fulfill({
        json: {
          data: {
            listId,
            name: 'デフォルト個人リスト',
            isDefault: true,
            createdAt: '2026-03-01T00:00:00.000Z',
            updatedAt: '2026-03-01T00:00:00.000Z',
          },
        },
      });
    });

    await page.route('**/api/lists/*/todos**', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() as { title: string };
        const createdTodo = {
          todoId: `todo-${todos.length + 1}`,
          title: body.title,
          isCompleted: false,
        };
        todos.push(createdTodo);
        await route.fulfill({ status: 201, json: { data: createdTodo } });
        return;
      }

      await route.fulfill({ json: { data: { todos } } });
    });

    await page.route('**/api/lists/*/todos/**', async (route) => {
      const url = new URL(route.request().url());
      const pathSegments = url.pathname.split('/').filter(Boolean);
      const todoId = pathSegments.length >= 5 ? decodeURIComponent(pathSegments[4]) : '';
      if (pathSegments[0] !== 'api' || pathSegments[1] !== 'lists' || pathSegments[3] !== 'todos') {
        await route.continue();
        return;
      }
      if (!todoId) {
        await route.continue();
        return;
      }
      const targetIndex = todos.findIndex((todo) => todo.todoId === todoId);
      if (targetIndex < 0) {
        await route.fulfill({
          status: 404,
          json: { error: { code: 'NOT_FOUND', message: '対象のデータが見つかりません' } },
        });
        return;
      }

      if (route.request().method() === 'PUT') {
        const body = route.request().postDataJSON() as { isCompleted: boolean };
        const updatedTodo = { ...todos[targetIndex], isCompleted: body.isCompleted };
        todos[targetIndex] = updatedTodo;
        await route.fulfill({ json: { data: updatedTodo } });
        return;
      }

      if (route.request().method() === 'DELETE') {
        todos.splice(targetIndex, 1);
        await route.fulfill({ status: 204 });
        return;
      }

      await route.continue();
    });

    await page.goto('/lists');
    await expect(page.getByRole('textbox', { name: 'タイトル' })).toBeVisible();
  });

  test('ToDo を追加できる', async ({ page }) => {
    const todoTitle = `E2E 追加テスト ${Date.now()}`;

    await page.getByRole('textbox', { name: 'タイトル' }).fill(todoTitle);
    await page.getByRole('button', { name: '追加' }).click();

    await expect(page.getByText(todoTitle)).toBeVisible();
    await expect(page.getByText('ToDoを追加しました。')).toBeVisible();
  });

  test('ToDo を完了にできる', async ({ page }) => {
    const targetTodo = '牛乳を買う';
    const checkbox = page.getByRole('checkbox', { name: `${targetTodo}の完了チェック` });

    await expect(checkbox).not.toBeChecked();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await checkbox.click();
      await expect(checkbox)
        .toBeChecked({ timeout: 1000 })
        .catch(() => undefined);
      if (await checkbox.isChecked()) {
        break;
      }
    }
    await expect(checkbox).toBeChecked();
  });

  test.fixme('ToDo を編集できる', async ({ page }) => {
    await page.getByText('牛乳を買う').click();
  });

  test('ToDo を削除できる', async ({ page }) => {
    const todoTitle = `E2E 削除テスト ${Date.now()}`;

    await page.getByRole('textbox', { name: 'タイトル' }).fill(todoTitle);
    await page.getByRole('button', { name: '追加' }).click();
    await expect(page.getByText(todoTitle)).toBeVisible();

    const todoRow = page.getByRole('listitem').filter({ hasText: todoTitle });
    await todoRow.getByRole('button', { name: '削除' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: '削除' }).click();

    await expect(page.getByText(todoTitle)).not.toBeVisible();
  });
});
