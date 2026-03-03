import { expect, test } from '@playwright/test';

type PersonalList = {
  listId: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

test.describe('個人リスト管理', () => {
  test.beforeEach(async ({ page }) => {
    const now = '2026-03-01T00:00:00.000Z';
    const lists: PersonalList[] = [
      {
        listId: 'list-default',
        name: 'デフォルトリスト',
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        listId: 'list-work',
        name: '仕事リスト',
        isDefault: false,
        createdAt: now,
        updatedAt: now,
      },
    ];

    await page.route('**/api/lists', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() as { name: string };
        const createdAt = new Date().toISOString();
        const createdList: PersonalList = {
          listId: `list-${lists.length + 1}`,
          name: body.name,
          isDefault: false,
          createdAt,
          updatedAt: createdAt,
        };
        lists.push(createdList);
        await route.fulfill({ status: 201, json: { data: createdList } });
        return;
      }

      await route.fulfill({ json: { data: { lists } } });
    });

    await page.route('**/api/lists/*', async (route) => {
      const url = new URL(route.request().url());
      const matched = url.pathname.match(/^\/api\/lists\/([^/]+)$/);
      if (!matched) {
        await route.continue();
        return;
      }

      const listId = decodeURIComponent(matched[1]);
      const targetIndex = lists.findIndex((list) => list.listId === listId);
      if (targetIndex < 0) {
        await route.fulfill({
          status: 404,
          json: {
            error: {
              code: 'NOT_FOUND',
              message: '対象のデータが見つかりません',
            },
          },
        });
        return;
      }

      const target = lists[targetIndex];

      if (route.request().method() === 'PUT') {
        const body = route.request().postDataJSON() as { name: string };
        const updated: PersonalList = {
          ...target,
          name: body.name,
          updatedAt: new Date().toISOString(),
        };
        lists[targetIndex] = updated;
        await route.fulfill({ json: { data: updated } });
        return;
      }

      if (route.request().method() === 'DELETE') {
        if (target.isDefault) {
          await route.fulfill({
            status: 400,
            json: {
              error: {
                code: 'DEFAULT_LIST_NOT_DELETABLE',
                message: 'デフォルトリストは削除できません',
              },
            },
          });
          return;
        }

        lists.splice(targetIndex, 1);
        await route.fulfill({ status: 204 });
        return;
      }

      await route.fulfill({ json: { data: target } });
    });

    await page.goto('/lists/list-default');
    await expect(page.getByRole('button', { name: '個人リストを作成' })).toBeVisible();
  });

  test('個人リストを作成できる', async ({ page }) => {
    page.once('dialog', async (dialog) => {
      expect(dialog.type()).toBe('prompt');
      await dialog.accept('旅行リスト');
    });

    await page.getByRole('button', { name: '個人リストを作成' }).click();

    await expect(page.getByText('旅行リスト')).toBeVisible();
    await expect(page.getByText('個人リストを作成しました。')).toBeVisible();
    await expect(page).toHaveURL(/\/lists\/list-3$/);
  });

  test('個人リストを切り替えできる', async ({ page }) => {
    await page.getByRole('link', { name: '仕事リスト' }).click();

    await expect(page).toHaveURL(/\/lists\/list-work$/);
    await expect(page.getByText('週次レポートを作成する')).toBeVisible();
    await expect(page.getByRole('link', { name: '仕事リスト' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  test('個人リスト名を変更できる', async ({ page }) => {
    page.once('dialog', async (dialog) => {
      expect(dialog.type()).toBe('prompt');
      await dialog.accept('仕事（更新）');
    });

    await page.getByRole('button', { name: '仕事リストを編集' }).click();

    await expect(page.getByText('仕事（更新）')).toBeVisible();
    await expect(page.getByText('個人リスト名を更新しました。')).toBeVisible();
  });

  test('デフォルト以外の個人リストを削除できる', async ({ page }) => {
    page.once('dialog', async (dialog) => {
      expect(dialog.type()).toBe('confirm');
      await dialog.accept();
    });

    await page.getByRole('button', { name: '仕事リストを削除' }).click();

    await expect(page.getByText('仕事リスト')).not.toBeVisible();
    await expect(page.getByText('個人リストを削除しました。')).toBeVisible();
  });

  test('デフォルトリストは削除できない', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'デフォルトリストを削除' })).toBeDisabled();
  });
});
