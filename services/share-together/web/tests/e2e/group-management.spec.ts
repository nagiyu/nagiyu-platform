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
    await page.getByRole('button', { name: 'グループを脱退' }).click();
    await page.getByRole('dialog').getByRole('button', { name: '脱退' }).click();
    await expect(page.getByText('グループから脱退しました。')).toBeVisible();
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
    await page.getByRole('button', { name: 'テストメンバーを削除' }).click();
    await page.getByRole('dialog').getByRole('button', { name: '削除' }).click();
    await expect(page.getByText('テストメンバーさんをグループから削除しました。')).toBeVisible();
  });
});
