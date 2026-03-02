import { expect, test } from '@playwright/test';

test.describe('個人 ToDo 管理', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { level: 1, name: 'デフォルト個人リスト' })
    ).toBeVisible();
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
    await checkbox.click();
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
