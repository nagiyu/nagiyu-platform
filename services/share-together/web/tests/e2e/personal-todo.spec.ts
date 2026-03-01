import { expect, test } from '@playwright/test';

test.describe('個人ToDoリスト管理', () => {
  test('ToDoの追加・完了・編集・削除ができる', async ({ page }) => {
    const initialTitle = `E2E ToDo ${Date.now()}`;
    const editedTitle = `${initialTitle} 編集後`;

    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'デフォルト個人リスト' })).toBeVisible();

    await page.getByRole('textbox', { name: 'タイトル' }).fill(initialTitle);
    await page.getByRole('button', { name: '追加' }).click();

    await expect(page.getByText(initialTitle, { exact: true })).toBeVisible();

    const initialCheckbox = page.getByRole('checkbox', { name: `${initialTitle}の完了チェック` });
    await expect(initialCheckbox).not.toBeChecked();
    await initialCheckbox.click();
    await expect(initialCheckbox).toBeChecked();

    await Promise.all([
      page.waitForEvent('dialog').then(async (dialog) => {
        await dialog.accept(editedTitle);
      }),
      page
        .locator('li', { hasText: initialTitle })
        .getByRole('button', { name: `${initialTitle}を編集` })
        .click(),
    ]);

    await expect(page.getByText(editedTitle, { exact: true })).toBeVisible();
    await expect(page.getByText(initialTitle, { exact: true })).not.toBeVisible();

    await page.locator('li', { hasText: editedTitle }).getByRole('button', { name: '削除' }).click();
    await page.getByRole('dialog').getByRole('button', { name: '削除' }).click();

    await expect(page.getByText(editedTitle, { exact: true })).not.toBeVisible();
  });
});
