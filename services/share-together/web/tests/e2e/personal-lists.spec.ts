import { expect, test } from '@playwright/test';
import { resetTestData, TEST_USER } from './helpers/test-data';

const createPersonalListByDialog = async (page: import('@playwright/test').Page, name: string) => {
  await page.getByRole('button', { name: '個人リストを作成' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'リスト名' }).fill(name);
  await dialog.getByRole('button', { name: '作成' }).click();
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
    await createPersonalListByDialog(page, '旅行リスト');
    await expect(page.getByText('旅行リスト')).toBeVisible();
  });

  test('個人リストを切り替えできる', async ({ page }) => {
    await page.getByRole('button', { name: '仕事リスト' }).first().click();
    await expect(page.getByRole('button', { name: '仕事リスト' }).first()).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  test('選んだ個人リストが URL に反映され、リロード後も残る', async ({ page }) => {
    await page.getByRole('button', { name: '仕事リスト' }).first().click();
    await expect(page).toHaveURL(/\/lists\?listId=list-work$/);

    await page.reload();

    await expect(page.getByRole('button', { name: '仕事リスト' }).first()).toHaveAttribute(
      'aria-current',
      'page'
    );
    await expect(
      page.getByRole('button', { name: 'デフォルトリスト' }).first()
    ).not.toHaveAttribute('aria-current', 'page');
  });

  test('作成した個人リストがリロード後も選択されている', async ({ page }) => {
    await createPersonalListByDialog(page, '旅行リスト');
    await expect(page).toHaveURL(/\/lists\?listId=(?!list-default$)(?!list-work$)[^&]+$/);

    await page.reload();

    await expect(page.getByRole('button', { name: '旅行リスト' }).first()).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  test('選んだ共有リストが URL に反映され、リロード後も残る', async ({ page, request }) => {
    await resetTestData(request, {
      users: [TEST_USER],
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
          groupId: 'reload-group',
          name: 'リロード検証グループ',
          ownerUserId: TEST_USER.userId,
        },
      ],
      memberships: [
        {
          groupId: 'reload-group',
          userId: TEST_USER.userId,
          role: 'OWNER',
          status: 'ACCEPTED',
          respondedAt: Date.now(),
        },
      ],
      groupLists: [
        {
          listId: 'reload-list-a',
          groupId: 'reload-group',
          name: '共有リストA',
          createdBy: TEST_USER.userId,
        },
        {
          listId: 'reload-list-b',
          groupId: 'reload-group',
          name: '共有リストB',
          createdBy: TEST_USER.userId,
        },
      ],
    });

    await page.goto('/lists?listId=list-default');
    await page.getByLabel('表示範囲').first().selectOption('shared');
    await page.getByRole('button', { name: '共有リストB', exact: true }).click();
    await expect(page).toHaveURL(
      /\/lists\?scope=shared&groupId=reload-group&listId=reload-list-b$/
    );

    // 前回表示したページの復元にも選択が引き継がれる (useSearchParams が書き換えに追従している)。
    await expect
      .poll(() =>
        page.evaluate(() => window.localStorage.getItem('share-together:last-visited-path'))
      )
      .toBe('/lists?scope=shared&groupId=reload-group&listId=reload-list-b');

    await page.reload();

    await expect(page.getByLabel('表示範囲').first()).toHaveValue('shared');
    await expect(page.getByRole('button', { name: '共有リストB', exact: true })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  // エラー文言が出るのは next dev の Strict Mode で取得の effect が二重に走るときだけで、
  // CI の本番ビルド (next start) では修正が無くても通る。回帰は lists ページの単体テストで検出する。
  test('共有リストを表示した状態からヘッダーの「リスト」で戻っても、エラー文言を経由せず個人リストを開く', async ({
    page,
    request,
  }) => {
    await resetTestData(request, {
      users: [TEST_USER],
      personalLists: [
        {
          listId: 'list-default',
          userId: TEST_USER.userId,
          name: 'デフォルトリスト',
          isDefault: true,
        },
      ],
      groups: [{ groupId: 'back-group', name: '戻り検証グループ', ownerUserId: TEST_USER.userId }],
      memberships: [
        {
          groupId: 'back-group',
          userId: TEST_USER.userId,
          role: 'OWNER',
          status: 'ACCEPTED',
          respondedAt: Date.now(),
        },
      ],
      groupLists: [
        {
          listId: 'back-list',
          groupId: 'back-group',
          name: '戻り検証リスト',
          createdBy: TEST_USER.userId,
        },
      ],
    });

    await page.goto('/lists?scope=shared&groupId=back-group&listId=back-list');
    await expect(page.getByRole('button', { name: '戻り検証リスト', exact: true })).toHaveAttribute(
      'aria-current',
      'page'
    );

    // 一瞬しか出ないエラー文言を、描画のたびに DOM を見て取りこぼさず記録する。
    // ヘッダーのリンクは通常のリンクで文書ごと読み込み直すため、読み込みのたびに仕掛け直す。
    await page.addInitScript(() => {
      const target = window as unknown as { __sawListLoadError: boolean };
      target.__sawListLoadError = false;
      new MutationObserver(() => {
        if (document.body?.textContent?.includes('デフォルト個人リストの取得に失敗しました。')) {
          target.__sawListLoadError = true;
        }
      }).observe(document, { childList: true, subtree: true, characterData: true });
    });

    // モバイル幅ではナビゲーションがメニューに畳まれているので、開いてからリンクを押す。
    const menuButton = page.getByRole('button', { name: 'メニューを開く' });
    if (await menuButton.isVisible()) {
      await menuButton.click();
    }
    await page.getByRole('link', { name: 'リスト', exact: true }).click();

    await expect(page.getByRole('button', { name: 'デフォルトリスト' }).first()).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(
      await page.evaluate(
        () => (window as unknown as { __sawListLoadError: boolean }).__sawListLoadError
      )
    ).toBe(false);
  });

  test('削除済みの個人リストの URL を開くと、デフォルトの個人リストを開く', async ({ page }) => {
    await page.goto('/lists?listId=list-deleted-elsewhere');

    await expect(page.getByRole('button', { name: 'デフォルトリスト' }).first()).toHaveAttribute(
      'aria-current',
      'page'
    );
    await expect(page.getByText('ToDo一覧の取得に失敗しました。')).not.toBeVisible();
  });

  test('共有リストを選んだあと、新しいセッションでトップに来ると選んだ共有リストが開く', async ({
    page,
    request,
  }) => {
    await resetTestData(request, {
      users: [TEST_USER],
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
          groupId: 'restore-group',
          name: '復元検証グループ',
          ownerUserId: TEST_USER.userId,
        },
      ],
      memberships: [
        {
          groupId: 'restore-group',
          userId: TEST_USER.userId,
          role: 'OWNER',
          status: 'ACCEPTED',
          respondedAt: Date.now(),
        },
      ],
      groupLists: [
        {
          listId: 'restore-list-a',
          groupId: 'restore-group',
          name: '復元リストA',
          createdBy: TEST_USER.userId,
        },
        {
          listId: 'restore-list-b',
          groupId: 'restore-group',
          name: '復元リストB',
          createdBy: TEST_USER.userId,
        },
      ],
    });

    await page.goto('/lists?listId=list-default');
    await page.getByLabel('表示範囲').first().selectOption('shared');
    await page.getByRole('button', { name: '復元リストB', exact: true }).click();
    await expect(page).toHaveURL(/scope=shared&groupId=restore-group&listId=restore-list-b$/);

    // localStorage は共有し、sessionStorage は共有しない新しいタブで「新しいセッション」を再現する。
    const newTab = await page.context().newPage();
    await newTab.goto('/');

    await expect(newTab).toHaveURL(/scope=shared&groupId=restore-group&listId=restore-list-b$/);
    await expect(newTab.getByRole('button', { name: '復元リストB', exact: true })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  test('リストが 0 件のグループを選ぶと、リロード後もそのグループが選ばれている', async ({
    page,
    request,
  }) => {
    await resetTestData(request, {
      users: [TEST_USER],
      personalLists: [
        {
          listId: 'list-default',
          userId: TEST_USER.userId,
          name: 'デフォルトリスト',
          isDefault: true,
        },
      ],
      groups: [
        { groupId: 'group-a', name: 'グループA', ownerUserId: TEST_USER.userId },
        { groupId: 'group-empty', name: '空のグループ', ownerUserId: TEST_USER.userId },
      ],
      memberships: [
        {
          groupId: 'group-a',
          userId: TEST_USER.userId,
          role: 'OWNER',
          status: 'ACCEPTED',
          respondedAt: Date.now(),
        },
        {
          groupId: 'group-empty',
          userId: TEST_USER.userId,
          role: 'OWNER',
          status: 'ACCEPTED',
          respondedAt: Date.now(),
        },
      ],
      groupLists: [
        {
          listId: 'group-a-list',
          groupId: 'group-a',
          name: 'グループAのリスト',
          createdBy: TEST_USER.userId,
        },
      ],
    });

    await page.goto('/lists?listId=list-default');
    await page.getByLabel('表示範囲').first().selectOption('shared');
    await expect(
      page.getByRole('button', { name: 'グループAのリスト', exact: true })
    ).toBeVisible();
    await page
      .getByRole('main')
      .getByLabel('グループ', { exact: true })
      .selectOption('group-empty');
    await expect(page).toHaveURL(/\/lists\?scope=shared&groupId=group-empty$/);

    await page.reload();

    await expect(page.getByLabel('表示範囲').first()).toHaveValue('shared');
    await expect(page.getByRole('main').getByLabel('グループ', { exact: true })).toHaveValue(
      'group-empty'
    );
  });

  test('個人リスト名を変更できる', async ({ page }) => {
    await page.getByRole('button', { name: '仕事リストを編集' }).first().click();
    const dialog = page.getByRole('dialog');
    // 名前変更では現在の名前が入力済みで開く。
    await expect(dialog.getByRole('textbox', { name: 'リスト名' })).toHaveValue('仕事リスト');
    await dialog.getByRole('textbox', { name: 'リスト名' }).fill('仕事（更新）');
    await dialog.getByRole('button', { name: '保存' }).click();
    await expect(page.getByText('仕事（更新）')).toBeVisible();
    await expect(page.getByText('個人リスト名を更新しました。')).toBeVisible();
  });

  test('デフォルト以外の個人リストを削除できる', async ({ page }) => {
    await page.getByRole('button', { name: '仕事リストを削除' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: '削除' }).click();
    await expect(page.getByText('個人リストを削除しました。')).toBeVisible();
  });

  test('デフォルトリストは削除できない', async ({ page }) => {
    // 旧実装は「ボタンがあれば disabled、無ければ 0 件」を許容しており、どちらに転んでも
    // green になる形骸化だった。実装（src/components/ListSidebar.tsx）は
    // `disabled={list.isDefault === true}` でボタン自体は必ず描画するため、
    // 「存在して、かつ disabled」という単一の結末に固定する。
    const defaultDeleteButton = page.getByRole('button', { name: 'デフォルトリストを削除' });

    await expect(defaultDeleteButton).toHaveCount(1);
    await expect(defaultDeleteButton).toBeDisabled();
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

    // 自分の個人リストに無い listId は開かず、自分のデフォルトリストを開く。
    await page.goto('/lists?listId=other-default-list');
    await expect(page.getByRole('button', { name: 'デフォルトリスト' }).first()).toHaveAttribute(
      'aria-current',
      'page'
    );
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
    await expect(page.getByRole('button', { name: '追加リスト1', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '追加リスト2', exact: true })).toHaveCount(0);

    await resetTestData(request, {
      users: [TEST_USER],
      personalLists: createPersonalLists(100),
    });
    await expect(page.getByRole('button', { name: '個人リストを作成' })).toBeEnabled();

    const createListResponsePromise = page.waitForResponse(
      (response) => response.request().method() === 'POST' && response.url().endsWith('/api/lists')
    );
    await page.getByRole('button', { name: '個人リストを作成' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: 'リスト名' }).fill('追加できないリスト');
    await dialog.getByRole('button', { name: '作成' }).click();
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
          respondedAt: Date.now(),
        },
        {
          groupId: 'scope-switch-group',
          userId: 'shared-member',
          role: 'MEMBER',
          status: 'ACCEPTED',
          invitedBy: TEST_USER.userId,
          invitedAt: Date.now(),
          respondedAt: Date.now(),
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

    const scopeSelect = page.getByLabel('表示範囲').first();

    await scopeSelect.selectOption('shared');
    await expect(page.getByText('共有スコープToDo')).toBeVisible();

    await scopeSelect.selectOption('personal');
    await expect(page.getByText('個人スコープToDo')).toBeVisible();
    await expect(page.getByText('ToDo一覧の取得に失敗しました。')).not.toBeVisible();
  });

  test('共有リストの直リンクから入って個人へ切り替えると、デフォルト個人リストのToDoを表示する', async ({
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
          respondedAt: Date.now(),
        },
        {
          groupId: 'scope-switch-group',
          userId: 'shared-member',
          role: 'MEMBER',
          status: 'ACCEPTED',
          invitedBy: TEST_USER.userId,
          invitedAt: Date.now(),
          respondedAt: Date.now(),
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

    await page.goto('/lists?scope=shared&groupId=scope-switch-group&listId=scope-shared-list');
    await expect(page.getByText('共有スコープToDo')).toBeVisible();

    await page.getByLabel('表示範囲').first().selectOption('personal');

    await expect(page.getByText('個人スコープToDo')).toBeVisible();
    await expect(page.getByText('共有スコープToDo')).not.toBeVisible();
    await expect(page.getByText('ToDo一覧の取得に失敗しました。')).not.toBeVisible();
  });

  test('共有スコープのリスト画面から共有リストを作成できる', async ({ page, request }) => {
    await resetTestData(request, {
      users: [TEST_USER],
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
          groupId: 'shared-create-group',
          name: '共有作成検証グループ',
          ownerUserId: TEST_USER.userId,
        },
      ],
      memberships: [
        {
          groupId: 'shared-create-group',
          userId: TEST_USER.userId,
          role: 'OWNER',
          status: 'ACCEPTED',
          respondedAt: Date.now(),
        },
      ],
      groupLists: [
        {
          listId: 'shared-create-initial-list',
          groupId: 'shared-create-group',
          name: '既存共有リスト',
          createdBy: TEST_USER.userId,
        },
      ],
    });

    await page.goto('/lists?listId=list-default');
    const scopeSelect = page.getByLabel('表示範囲').first();
    await scopeSelect.selectOption('shared');
    await expect(page.getByRole('main').getByLabel('グループ')).toHaveValue('shared-create-group');
    await expect(page.getByRole('button', { name: '共有リストを作成' })).toBeVisible();

    await page.getByRole('button', { name: '共有リストを作成' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: 'リスト名' }).fill('E2E共有作成リスト');
    const createListResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().includes('/api/groups/shared-create-group/lists')
    );
    await dialog.getByRole('button', { name: '作成' }).click();
    const createListResponse = await createListResponsePromise;
    expect(createListResponse.status()).toBe(201);

    await expect(
      page.getByRole('button', { name: 'E2E共有作成リスト', exact: true })
    ).toBeVisible();
    await expect(page.getByText('共有リスト「E2E共有作成リスト」を作成しました。')).toBeVisible();
  });
});
