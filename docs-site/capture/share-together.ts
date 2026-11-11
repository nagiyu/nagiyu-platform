import type { Locator, Page } from '@playwright/test';
import type { Scenario, ScenarioContext, ServiceCapture } from './types';
import {
  FAMILY_GROUP_ID,
  NAKAMURA,
  TEST_USER_EMAIL,
  TEST_USER_NAME,
  TRIP_GROUP_ID,
  buildEmptySeed,
  buildFullGroupSeed,
  buildFullSeed,
  buildInvitationSeed,
  buildInvitationToFullGroupSeed,
  buildNoGroupListSeed,
  buildNoGroupSeed,
  buildPersonalListLimitSeed,
  pinInvitationCreatedAt,
} from './share-together-data';

/**
 * share-together の撮影シナリオ。画面ごとに、カードで紹介する状態を撮る。
 * 状態を足したら、カードの「画面の見た目」にも同じ名前で足す。
 *
 * データは E2E と同じく、インメモリ DB を `/api/test/reset` で初期化して用意する。
 * 認証はテスト用の設定でスキップされ、利用者は常に 1 人 (ME) になる。
 * グループのオーナーとメンバーの違いは、グループのシードで自分の立場を変えて出す。
 */

const mockJson = async (
  page: Page,
  pattern: string,
  body: unknown,
  status = 200
): Promise<void> => {
  await page.route(pattern, (route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  );
};

/** 指定した URL の GET だけを失敗させる。同じ URL への POST などは本物の API に通す */
async function failGet(page: Page, pattern: string): Promise<void> {
  await page.route(pattern, (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'INTERNAL_SERVER_ERROR',
            message: 'サーバーエラーが発生しました',
          }),
        })
      : route.fallback()
  );
}

/** 招待日時は作成した時刻になり実行ごとに変わるため、固定の時刻に差し替える */
async function pinInvitations(page: Page): Promise<void> {
  await page.route('**/api/invitations', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const response = await route.fetch();
    const body = await response.json().catch(() => null);
    if (!body) return route.fulfill({ response });
    pinInvitationCreatedAt(body);
    return route.fulfill({ response, json: body });
  });
}

/** 描画が落ち着くまで待つ。サーバーの初回コンパイルで遅くなるため、待つ対象を明示する */
async function ready(page: Page, text: string): Promise<void> {
  await page.getByText(text, { exact: false }).first().waitFor();
  await settleNetwork(page);
  // ヘッダーの招待バッジなど、取得のあとに描き直される小さな部品が落ち着くまで待つ
  await page.waitForTimeout(BADGE_SETTLE_MS);
}

async function settleNetwork(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
}

/** 招待バッジの件数が反映され、描画が安定するまでの待ち */
const BADGE_SETTLE_MS = 800;

const dialog = (page: Page): Locator => page.getByRole('dialog');

/** ダイアログを開いた状態を撮る。ダイアログの周りだけを切り出す */
async function shotDialog(ctx: ScenarioContext, state: string): Promise<void> {
  await dialog(ctx.page).waitFor();
  await ctx.shot(state, { around: dialog(ctx.page) });
}

/** スナックバーなど、画面の下に固定される表示を撮る。ページ全体で撮ると固定位置がずれるため表示領域だけにする */
async function shotNotice(ctx: ScenarioContext, state: string, text: string): Promise<void> {
  await ctx.page.getByText(text, { exact: false }).first().waitFor();
  await ctx.shot(state, { viewportOnly: true });
}

/** データを入れ直し、新しいページで開く */
async function open(
  ctx: ScenarioContext,
  seed: unknown,
  path: string,
  prepare?: (page: Page) => Promise<void>
): Promise<Page> {
  await ctx.resetData(seed);
  const page = await ctx.freshPage();
  await prepare?.(page);
  await page.goto(path);
  return page;
}

const home: Scenario = {
  screen: 'home',
  async run(ctx) {
    const page = await open(ctx, buildFullSeed(), '/');
    await ready(page, 'Share Together へようこそ');
    await ctx.shot('default');
  },
};

/** 名前が完全に一致するボタン。「買い物を編集」のように、似た名前のボタンと区別するために使う */
const exactButton = (page: Page, name: string): Locator =>
  page.getByRole('button', { name, exact: true });

/** ToDo の 1 行。サイドバーのリスト名や操作ボタンと区別するため、タイトルを含む行で絞る */
const todoRow = (page: Page, title: string): Locator =>
  page
    .getByRole('listitem')
    .filter({ hasText: title })
    .filter({ has: page.getByRole('checkbox') });

const lists: Scenario = {
  screen: 'lists',
  async run(ctx) {
    // 個人リスト (通常。リストを指定せず、デフォルトリストが開く)
    let page = await open(ctx, buildFullSeed(), '/lists');
    await ready(page, '歯医者の予約を入れる');
    await ctx.shot('personal-default');

    // ToDo の編集欄を開いた状態
    await todoRow(page, '歯医者の予約を入れる')
      .getByRole('button', { name: '編集', exact: true })
      .click();
    await page.getByRole('textbox', { name: 'タイトルを編集' }).waitFor();
    await ctx.shot('todo-editing');

    // ToDo の削除の確認
    await page.reload();
    await ready(page, '歯医者の予約を入れる');
    await todoRow(page, '歯医者の予約を入れる')
      .getByRole('button', { name: '削除', exact: true })
      .click();
    await shotDialog(ctx, 'todo-delete-dialog');

    // 個人リストの作成・名前の変更・削除のダイアログ
    await page.keyboard.press('Escape');
    await dialog(page).waitFor({ state: 'detached' });
    await exactButton(page, '個人リストを作成').click();
    await shotDialog(ctx, 'list-create-dialog');
    await page.keyboard.press('Escape');
    await dialog(page).waitFor({ state: 'detached' });
    await exactButton(page, '買い物を編集').click();
    await shotDialog(ctx, 'list-rename-dialog');
    await page.keyboard.press('Escape');
    await dialog(page).waitFor({ state: 'detached' });
    await exactButton(page, '買い物を削除').click();
    await shotDialog(ctx, 'list-delete-dialog');

    // ToDo がない個人リスト
    page = await open(ctx, buildEmptySeed(), '/lists');
    await ready(page, 'ToDoはまだありません。');
    await ctx.shot('personal-empty');

    // 個人リストが 100 件に達した状態 (作成ボタンが押せない)
    page = await open(ctx, buildPersonalListLimitSeed(), '/lists');
    await ready(page, '個人リストは100件まで作成できます');
    await ctx.shot('list-limit', { viewportOnly: true });

    // ToDo の取得に失敗した状態
    await open(ctx, buildFullSeed(), '/lists', (p) => failGet(p, '**/api/lists/*/todos'));
    await shotNotice(ctx, 'todo-fetch-error', 'ToDo一覧の取得に失敗しました。');

    // 個人リスト一覧の取得に失敗し、開くリストが決まらない状態
    page = await open(ctx, buildFullSeed(), '/lists', (p) => failGet(p, '**/api/lists'));
    await ready(page, 'デフォルト個人リストの取得に失敗しました。');
    await ctx.shot('default-list-error', { viewportOnly: true });

    // 共有リスト (グループのオーナー)
    const sharedPath = (groupId: string) => `/lists?scope=shared&groupId=${groupId}`;
    page = await open(ctx, buildFullSeed(), sharedPath(FAMILY_GROUP_ID));
    await ready(page, '卵を 10 個買う');
    await ctx.shot('shared-default');

    // 共有リストの作成・名前の変更・削除のダイアログ
    await exactButton(page, '共有リストを作成').click();
    await shotDialog(ctx, 'shared-create-dialog');
    await page.keyboard.press('Escape');
    await dialog(page).waitFor({ state: 'detached' });
    await exactButton(page, '買い物を編集').click();
    await shotDialog(ctx, 'shared-rename-dialog');
    await page.keyboard.press('Escape');
    await dialog(page).waitFor({ state: 'detached' });
    await exactButton(page, '買い物を削除').click();
    await shotDialog(ctx, 'shared-delete-dialog');

    // 共有リスト (オーナーではないメンバー。操作できる内容はオーナーと同じ)
    page = await open(ctx, buildFullSeed(), sharedPath(TRIP_GROUP_ID));
    await ready(page, '新幹線の切符を取る');
    await ctx.shot('shared-member');

    // グループに入っていない
    page = await open(ctx, buildNoGroupSeed(), '/lists?scope=shared');
    await ready(page, '参加しているグループがありません。');
    await ctx.shot('shared-no-groups');

    // 共有リストがない
    page = await open(ctx, buildNoGroupListSeed(), sharedPath(FAMILY_GROUP_ID));
    await ready(page, '共有リストはまだありません。');
    await ctx.shot('shared-no-lists');

    // グループ一覧の取得に失敗した
    page = await open(ctx, buildFullSeed(), sharedPath(FAMILY_GROUP_ID), (p) =>
      failGet(p, '**/api/groups')
    );
    await ready(page, '共有グループ一覧を取得できませんでした。');
    await ctx.shot('shared-groups-fetch-error');

    // 選んだグループの共有リストの取得に失敗した
    page = await open(ctx, buildFullSeed(), sharedPath(FAMILY_GROUP_ID), (p) =>
      failGet(p, '**/api/groups/*/lists')
    );
    await ready(page, 'このグループの共有リストを取得できませんでした。');
    await ctx.shot('shared-lists-fetch-error');
  },
};

/** グループカード (一覧の選択ボタン) */
const groupCard = (page: Page, name: string): Locator =>
  page.getByRole('button', { name: new RegExp(`^${name}`) });

/** 招待フォームにメールアドレスを入れて送信する */
async function invite(page: Page, email: string): Promise<void> {
  await page.getByLabel('メールアドレス').fill(email);
  await page.getByRole('button', { name: '招待を送信' }).click();
}

const groups: Scenario = {
  screen: 'groups',
  async run(ctx) {
    const detailReady = async (page: Page, group: string): Promise<void> => {
      await page.getByRole('heading', { name: group, level: 2, exact: true }).first().waitFor();
      await page.getByText('メンバー招待フォーム').waitFor();
      await settleNetwork(page);
    };

    // オーナーとして開いたグループ
    let page = await open(ctx, buildFullSeed(), '/groups');
    await detailReady(page, '家族');
    await ctx.shot('owner');

    // メンバーを外す確認 / グループを削除する確認
    await exactButton(page, '鈴木 一郎を削除').click();
    await shotDialog(ctx, 'remove-member-dialog');
    await page.keyboard.press('Escape');
    await dialog(page).waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'グループを削除' }).click();
    await shotDialog(ctx, 'delete-group-dialog');

    // グループを作る / 作成に失敗した
    await page.keyboard.press('Escape');
    await dialog(page).waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'グループを作成' }).click();
    await shotDialog(ctx, 'create-dialog');
    await dialog(page).getByLabel('グループ名').fill('あ'.repeat(101));
    await dialog(page).getByRole('button', { name: '作成' }).click();
    await shotNotice(ctx, 'create-error', 'グループの作成に失敗しました。');

    // 招待の送信 (成功 / 形式の誤り / 登録のないメールアドレス)
    page = await open(ctx, buildFullSeed(), '/groups');
    await detailReady(page, '家族');
    await invite(page, NAKAMURA.email);
    await page.getByText('招待を送信しました。').waitFor();
    await ctx.shot('invite-sent');

    page = await open(ctx, buildFullSeed(), '/groups');
    await detailReady(page, '家族');
    await invite(page, 'not-an-email');
    await page.getByText('メールアドレスの形式が正しくありません').waitFor();
    await ctx.shot('invite-invalid-email');

    page = await open(ctx, buildFullSeed(), '/groups');
    await detailReady(page, '家族');
    await invite(page, 'unknown@example.com');
    await page.getByText('このメールアドレスのユーザーは登録されていません').waitFor();
    await ctx.shot('invite-not-registered');

    // メンバーが 5 名に達したグループ (招待できない)
    page = await open(ctx, buildFullGroupSeed(), '/groups');
    await detailReady(page, '町内会');
    await ctx.shot('member-limit');

    // メンバーとして開いたグループ
    page = await open(ctx, buildFullSeed(), '/groups');
    await detailReady(page, '家族');
    await groupCard(page, '旅行計画').click();
    await detailReady(page, '旅行計画');
    await ctx.shot('member');

    // 脱退の確認と、脱退した直後
    await page.getByRole('button', { name: 'グループを脱退' }).click();
    await shotDialog(ctx, 'leave-dialog');
    await dialog(page).getByRole('button', { name: '脱退' }).click();
    await page.getByRole('alert').filter({ hasText: 'グループから脱退しました。' }).waitFor();
    await ctx.shot('left', { viewportOnly: true });

    // グループを削除した直後
    page = await open(ctx, buildFullSeed(), '/groups');
    await detailReady(page, '家族');
    await page.getByRole('button', { name: 'グループを削除' }).click();
    await dialog(page).getByRole('button', { name: '削除' }).click();
    await page.getByRole('alert').filter({ hasText: 'グループを削除しました。' }).waitFor();
    await ctx.shot('deleted', { viewportOnly: true });

    // グループがない
    page = await open(ctx, buildNoGroupSeed(), '/groups');
    await ready(page, 'グループはまだありません。');
    await ctx.shot('empty');

    // 一覧の取得に失敗した
    await open(ctx, buildFullSeed(), '/groups', (p) => failGet(p, '**/api/groups'));
    await shotNotice(ctx, 'fetch-error', 'グループ一覧の取得に失敗しました。');

    // 選んだグループの詳細の取得に失敗した
    page = await open(ctx, buildFullSeed(), '/groups', (p) =>
      failGet(p, '**/api/groups/*/members')
    );
    await ready(page, 'グループ詳細の取得に失敗しました。');
    await ctx.shot('detail-fetch-error');
  },
};

const invitations: Scenario = {
  screen: 'invitations',
  async run(ctx) {
    const withPin = pinInvitations;

    // 招待が届いている
    let page = await open(ctx, buildInvitationSeed(), '/invitations', withPin);
    await ready(page, '読書会');
    await ctx.shot('default');

    // 拒否の確認
    await page.getByRole('button', { name: '拒否', exact: true }).first().click();
    await shotDialog(ctx, 'reject-dialog');

    // 承認した直後
    page = await open(ctx, buildInvitationSeed(), '/invitations', withPin);
    await ready(page, '読書会');
    await page.getByRole('button', { name: '承認', exact: true }).first().click();
    await page.getByText('への参加を承認しました。').waitFor();
    await ctx.shot('accepted', { viewportOnly: true });

    // 承認できなかった (メンバーが 5 名に達している)
    page = await open(ctx, buildInvitationToFullGroupSeed(), '/invitations', withPin);
    await ready(page, '町内会');
    await page.getByRole('button', { name: '承認', exact: true }).click();
    await shotNotice(ctx, 'accept-failed', 'グループメンバーは最大5名です');

    // 招待の期限が切れていた (一覧から外れる)
    page = await open(ctx, buildInvitationSeed(), '/invitations', async (p) => {
      await withPin(p);
      await mockJson(
        p,
        '**/api/invitations/*',
        { error: 'INVITATION_EXPIRED', message: '招待の有効期限が切れています' },
        409
      );
    });
    await ready(page, '読書会');
    await page.getByRole('button', { name: '承認', exact: true }).first().click();
    await shotNotice(ctx, 'expired', '招待の有効期限が切れています');

    // 招待がない
    page = await open(ctx, buildNoGroupSeed(), '/invitations', withPin);
    await ready(page, '招待はありません。');
    await ctx.shot('empty');

    // 一覧の取得に失敗した
    await open(ctx, buildInvitationSeed(), '/invitations', (p) => failGet(p, '**/api/invitations'));
    await shotNotice(ctx, 'fetch-error', '招待一覧の取得に失敗しました。');
  },
};

export const shareTogether: ServiceCapture = {
  service: 'share-together',
  // 要件が PWA のモバイルファーストを求め、レイアウトも md 以上でサイドバーが横に並ぶため、両方を撮る
  devices: ['mobile', 'desktop'],
  server: {
    cwd: 'services/share-together/web',
    build: ['npm', 'run', 'build'],
    command: ['npm', 'run', 'start', '--'],
    port: 3402,
    healthPath: '/api/health',
    envFile: 'services/share-together/web/.env.test',
    requiredBuilds: [
      'libs/ui/dist',
      'libs/nextjs/dist',
      'libs/aws/dist',
      'libs/common/dist',
      'libs/react/dist',
      'libs/browser/dist',
      'services/share-together/core/dist',
    ],
    // E2E の設定のままだと利用者名が英語の `Test User` になるため、画面の言語に合わせて日本語名にする
    extraEnv: {
      TEST_USER_NAME,
      TEST_USER_EMAIL,
      NEXTAUTH_URL: 'http://localhost:3402',
      BASE_URL: 'http://localhost:3402',
    },
  },
  // ロールで画面の出し分けをしないサービス
  defaultRoles: [],
  fixedTime: '2026-02-28T01:30:00Z',
  scenarios: [home, lists, groups, invitations],
};
