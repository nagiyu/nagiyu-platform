import { expect, test } from '@playwright/test';

type GroupSummaryResponse = {
  data: {
    groups: Array<{
      groupId: string;
      name?: string;
      ownerUserId: string;
      isOwner: boolean;
    }>;
  };
};

type GroupMembersResponse = {
  data: {
    members: Array<{
      userId: string;
      name: string;
    }>;
  };
};

test.describe('グループ管理', () => {
  test('グループを作成できる', async ({ page }) => {
    const createdGroupName = `E2E グループ ${Date.now()}`;
    const groups: GroupSummaryResponse['data']['groups'] = [
      {
        groupId: 'group-existing',
        name: '既存グループ',
        ownerUserId: 'owner-user',
        isOwner: true,
      },
    ];

    await page.route('**/api/groups', async (route) => {
      if (route.request().method() === 'POST') {
        const requestBody = route.request().postDataJSON() as { name: string };
        const createdGroup = {
          groupId: `group-${Date.now()}`,
          name: requestBody.name,
          ownerUserId: 'owner-user',
          isOwner: true,
        };
        groups.push(createdGroup);
        await route.fulfill({ json: { data: createdGroup } });
        return;
      }

      await route.fulfill({ json: { data: { groups } } });
    });

    await page.route('**/api/groups/*/members', async (route) => {
      await route.fulfill({
        json: {
          data: {
            members: [{ userId: 'owner-user', name: 'オーナー' }],
          },
        },
      });
    });

    await page.goto('/groups');
    await expect(page.getByRole('heading', { level: 1, name: 'グループ一覧' })).toBeVisible();

    await page.getByRole('button', { name: 'グループを作成' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: 'グループ名' }).fill(createdGroupName);
    await dialog.getByRole('button', { name: '作成' }).click();

    await expect(page.getByRole('heading', { level: 2, name: createdGroupName })).toBeVisible();
    await expect(page.getByText(`グループ「${createdGroupName}」を作成しました。`)).toBeVisible();
  });

  test('オーナーがメンバー招待を送信できる', async ({ page }) => {
    const groupId = 'group-owner';

    await page.route('**/api/groups', async (route) => {
      await route.fulfill({
        json: {
          data: {
            groups: [
              {
                groupId,
                name: 'E2E グループ',
                ownerUserId: 'owner-user',
                isOwner: true,
              },
            ],
          },
        } satisfies GroupSummaryResponse,
      });
    });

    await page.route(`**/api/groups/${groupId}/members`, async (route) => {
      await route.fulfill({
        json: {
          data: {
            members: [{ userId: 'owner-user', name: 'オーナー' }],
          },
        } satisfies GroupMembersResponse,
      });
    });

    await page.goto(`/groups/${groupId}`);
    await expect(page.getByRole('heading', { level: 1, name: 'グループ詳細' })).toBeVisible();

    await page.getByRole('textbox', { name: 'メールアドレス' }).fill('invitee@example.com');
    await page.getByRole('button', { name: '招待を送信' }).click();

    await expect(page.getByText('招待を送信しました。')).toBeVisible();
  });

  test('招待を承認できる', async ({ page }) => {
    await page.route('**/api/invitations', async (route) => {
      await route.fulfill({
        json: {
          data: {
            invitations: [
              {
                groupId: 'group-accept',
                groupName: '承認テストグループ',
                inviterName: 'オーナー',
                createdAt: '2026-03-01T00:00:00.000Z',
              },
            ],
          },
        },
      });
    });

    await page.route('**/api/invitations/*', async (route) => {
      await route.fulfill({ json: { data: { success: true } } });
    });

    await page.goto('/invitations');
    await expect(page.getByRole('heading', { level: 1, name: '招待一覧' })).toBeVisible();

    await page.getByRole('button', { name: '承認' }).click();

    await expect(page.getByText('「承認テストグループ」への参加を承認しました。')).toBeVisible();
    await expect(page.getByText('承認テストグループ')).not.toBeVisible();
  });

  test('招待を拒否できる', async ({ page }) => {
    await page.route('**/api/invitations', async (route) => {
      await route.fulfill({
        json: {
          data: {
            invitations: [
              {
                groupId: 'group-reject',
                groupName: '拒否テストグループ',
                inviterName: 'オーナー',
                createdAt: '2026-03-01T00:00:00.000Z',
              },
            ],
          },
        },
      });
    });

    await page.route('**/api/invitations/*', async (route) => {
      await route.fulfill({ json: { data: { success: true } } });
    });

    await page.goto('/invitations');
    await expect(page.getByText('拒否テストグループ')).toBeVisible();

    await page.getByRole('button', { name: '拒否' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: '拒否' }).click();

    await expect(page.getByText('「拒否テストグループ」への招待を拒否しました。')).toBeVisible();
    await expect(page.getByText('拒否テストグループ')).not.toBeVisible();
  });

  test('メンバーがグループから脱退できる', async ({ page }) => {
    const groupId = 'group-member';

    await page.route('**/api/groups', async (route) => {
      await route.fulfill({
        json: {
          data: {
            groups: [
              {
                groupId,
                name: '参加中グループ',
                ownerUserId: 'owner-user',
                isOwner: false,
              },
            ],
          },
        } satisfies GroupSummaryResponse,
      });
    });

    await page.route(`**/api/groups/${groupId}/members`, async (route) => {
      await route.fulfill({
        json: {
          data: {
            members: [
              { userId: 'owner-user', name: 'オーナー' },
              { userId: 'member-user', name: 'メンバー' },
            ],
          },
        } satisfies GroupMembersResponse,
      });
    });

    await page.goto(`/groups/${groupId}`);
    await expect(page.getByRole('button', { name: 'グループを脱退' })).toBeVisible();

    await page.getByRole('button', { name: 'グループを脱退' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: '脱退' }).click();

    await expect(page.getByText('グループから脱退しました（モック）。')).toBeVisible();
  });

  test('オーナーがメンバーを除外できる', async ({ page }) => {
    const groupId = 'group-owner';

    await page.route('**/api/groups', async (route) => {
      await route.fulfill({
        json: {
          data: {
            groups: [
              {
                groupId,
                name: '管理グループ',
                ownerUserId: 'owner-user',
                isOwner: true,
              },
            ],
          },
        } satisfies GroupSummaryResponse,
      });
    });

    await page.route(`**/api/groups/${groupId}/members`, async (route) => {
      await route.fulfill({
        json: {
          data: {
            members: [
              { userId: 'owner-user', name: 'オーナー' },
              { userId: 'member-user', name: 'テストメンバー' },
            ],
          },
        } satisfies GroupMembersResponse,
      });
    });

    await page.goto(`/groups/${groupId}`);
    await expect(page.getByRole('button', { name: 'テストメンバーを削除' })).toBeVisible();

    await page.getByRole('button', { name: 'テストメンバーを削除' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: '削除' }).click();

    await expect(
      page.getByText('テストメンバーさんをグループから削除しました（モック）。')
    ).toBeVisible();
    await expect(page.getByText('テストメンバー')).not.toBeVisible();
  });
});
