import type { Locator, Page } from '@playwright/test';
import type { Scenario, ScenarioContext, ServiceCapture } from './types';
import {
  normalizeVideoResponses,
  resetNiconicoData,
  stubThumbnails,
  type NiconicoSeed,
} from './niconico-mylist-assistant-data';

/**
 * niconico-mylist-assistant の撮影シナリオ。画面ごとに、カードで紹介する状態を撮る。
 * 状態を足したら、カードの「画面の見た目」にも同じ名前で足す。
 *
 * データはサービスの E2E と同じ作りで用意する (インメモリ DB + `/api/test/*`)。
 * ニコニコ動画・AWS Batch・Secrets Manager へ出る通信は、ブラウザから見える API の応答を差し替えて再現する
 * (サーバーから外へ出る通信は、撮影の仕組みからは差し替えられないため)。
 */

const FIXED_TIME = '2026-02-28T01:30:00Z';
const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse(FIXED_TIME);

/** 画面が使う実行中のジョブ ID */
const JOB_ID = '7f3a1c52-9d4e-4b8a-a6f1-2c5e8d9b0a13';

/** 一覧の撮影用に用意する動画の数 (1 ページ 20 件を超え、3 ページになる) */
const LIST_VIDEO_COUNT = 45;

const SEED_LIST: NiconicoSeed = {
  videos: LIST_VIDEO_COUNT,
  favorites: [44, 43, 41, 38, 30, 22, 9],
  skips: [42, 39, 37, 12],
  memos: { 44: '週末にまとめて聴く' },
};

const SEED_FEW: NiconicoSeed = {
  videos: 6,
  favorites: [5, 3],
  skips: [4],
  memos: { 5: '作業用 BGM の候補' },
};

type SessionStatus = {
  hasSession: boolean;
  validity?: 'valid' | 'invalid' | 'unknown';
  acquiredAt?: number;
  estimatedExpiresAt?: number;
};

const SESSION_VALID: SessionStatus = {
  hasSession: true,
  validity: 'valid',
  acquiredAt: NOW - 5 * DAY_MS,
  estimatedExpiresAt: NOW + 25 * DAY_MS,
};
const SESSION_INVALID: SessionStatus = { ...SESSION_VALID, validity: 'invalid' };
const SESSION_UNKNOWN: SessionStatus = { ...SESSION_VALID, validity: 'unknown' };
const SESSION_NONE: SessionStatus = { hasSession: false };

async function mockJson(page: Page, pattern: string | RegExp, body: unknown, status = 200) {
  await page.route(pattern, (route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  );
}

/** 応答を返さないまま保留する (処理中の表示を撮るため) */
async function hold(page: Page, pattern: string | RegExp, method?: string) {
  await page.route(pattern, (route) =>
    !method || route.request().method() === method ? new Promise(() => undefined) : route.fallback()
  );
}

/** ニコニコのセッションの状態を返す API を差し替える (GET)。保存・削除は呼ばれた形のまま成功にする */
async function mockSession(page: Page, status: SessionStatus) {
  await page.route('**/api/niconico/session', (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          validity: undefined,
          acquiredAt: undefined,
          estimatedExpiresAt: undefined,
          ...status,
        }),
      });
    }
    return route.fallback();
  });
}

async function ready(page: Page, text: string) {
  await page.getByText(text, { exact: false }).first().waitFor();
  await settleNetwork(page);
}

async function settleNetwork(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
}

/** 画面のエラー表示。Next.js の画面遷移の通知も `alert` なので、中身のあるものに絞る */
const errorAlert = (page: Page): Locator => page.getByRole('alert').filter({ hasText: /\S/ });
const dialog = (page: Page): Locator => page.getByRole('dialog');

async function shotDialog(ctx: ScenarioContext, state: string) {
  await dialog(ctx.page).last().waitFor();
  await ctx.shot(state, { around: dialog(ctx.page).last() });
}

/**
 * 画面に見えている画像が読み込まれるまで待つ。
 * 画面の外の画像は遅延読み込みで読まれないため、見えているものだけを数える
 */
async function imagesLoaded(page: Page) {
  await page.waitForFunction(() =>
    Array.from(document.images)
      .filter((image) => {
        const rect = image.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < window.innerHeight;
      })
      .every((image) => image.complete && image.naturalWidth > 0)
  );
}

/** 一覧の動画の画像が読み込まれるまで待つ */
async function videosLoaded(page: Page) {
  await page.locator('.MuiCard-root img').first().waitFor();
  await imagesLoaded(page);
}

const home: Scenario = {
  screen: 'home',
  async run(ctx) {
    await ctx.resetData({});
    const page = await ctx.freshPage();
    await page.goto('/');
    await ready(page, 'ようこそ');
    await ctx.shot('default', { viewportOnly: true });

    // 通知設定ダイアログ (購読前)
    await page.getByRole('button', { name: '通知設定' }).click();
    await dialog(page).waitFor();
    await shotDialog(ctx, 'notification-dialog');
  },
};

const importScreen: Scenario = {
  screen: 'import',
  async run(ctx) {
    await ctx.resetData({});
    const input = (page: Page) => page.getByPlaceholder(/sm9/);
    const open = async (page: Page) => {
      await stubThumbnails(page);
      await page.goto('/import');
      await ready(page, '動画一括インポート');
    };

    // 通常表示 (入力が空で、インポート実行は押せない)
    let page = await ctx.freshPage();
    await open(page);
    await ctx.shot('default', { viewportOnly: true });

    // 100 件を超えて入力した
    page = await ctx.freshPage();
    await open(page);
    await input(page).fill(Array.from({ length: 101 }, (_, i) => `sm${9000 + i}`).join('\n'));
    await page.getByRole('button', { name: 'インポート実行' }).click();
    await errorAlert(page).waitFor();
    await ctx.shot('too-many', { viewportOnly: true });

    // 形式が正しくない動画 ID を入力した (サーバーが ID の形式で弾く)
    page = await ctx.freshPage();
    await open(page);
    await input(page).fill('sm9\nabc\n12345\nvideo-1\nsm1000');
    await page.getByRole('button', { name: 'インポート実行' }).click();
    await page.getByText('形式が正しくない動画 ID').waitFor();
    await ctx.shot('invalid-ids', { viewportOnly: true });

    // インポート中 (応答が返らない)
    page = await ctx.freshPage();
    await open(page);
    await hold(page, '**/api/videos/bulk-import', 'POST');
    await input(page).fill('sm9\nsm1000\nsm2000');
    await page.getByRole('button', { name: 'インポート実行' }).click();
    await page.locator('button[aria-busy="true"]').waitFor();
    await ctx.shot('importing', { viewportOnly: true });

    // インポート結果 (成功・スキップ・失敗が混ざる)
    page = await ctx.freshPage();
    await open(page);
    await mockJson(page, '**/api/videos/bulk-import', {
      success: 3,
      failed: 2,
      skipped: 1,
      total: 6,
      failedDetails: [
        { videoId: 'sm40000001', error: '指定された動画は存在しません' },
        {
          videoId: 'sm40000002',
          error: '動画情報の取得に失敗しました: HTTPエラーが発生しました: 503',
        },
      ],
    });
    await input(page).fill('sm9\nsm1000\nsm2000\nsm3000\nsm40000001\nsm40000002');
    await page.getByRole('button', { name: 'インポート実行' }).click();
    await page.getByText('インポート結果').waitFor();
    await page.getByText('失敗した動画の詳細を表示').click();
    await page.getByText('動画ID: sm40000002').waitFor();
    await ctx.shot('result');

    // インポートに失敗した (サーバーのエラー)
    page = await ctx.freshPage();
    await open(page);
    await mockJson(
      page,
      '**/api/videos/bulk-import',
      { error: 'サーバーエラーが発生しました' },
      500
    );
    await input(page).fill('sm9');
    await page.getByRole('button', { name: 'インポート実行' }).click();
    await errorAlert(page).waitFor();
    await ctx.shot('import-error', { viewportOnly: true });

    // 動画検索ダイアログ (検索前)
    page = await ctx.freshPage();
    await open(page);
    await page.getByRole('button', { name: '動画を検索して追加' }).click();
    await dialog(page).waitFor();
    await shotDialog(ctx, 'search-dialog');

    // 検索結果 (追加できるもの・登録済みのもの)
    const searchResult = (index: number, title: string, isRegistered: boolean) => ({
      videoId: `sm${41000100 + index}`,
      title,
      description: '',
      thumbnailUrl: `https://example.com/sm${41000100 + index}.jpg`,
      duration: 200,
      viewCount: 1000,
      commentCount: 10,
      mylistCount: 5,
      uploadedAt: '2025-12-01T12:00:00+09:00',
      tags: [],
      isRegistered,
    });
    await mockJson(page, '**/api/videos/search**', {
      videos: [
        searchResult(0, '【作業用BGM】朝のピアノメドレー', false),
        searchResult(1, '雨の日に聴きたいローファイ・ビート', true),
        searchResult(2, '深夜のドライブ用シティポップ詰め合わせ', false),
      ],
      total: 3,
    });
    await page.getByLabel('検索キーワード').fill('作業用BGM');
    await page.getByRole('button', { name: '検索', exact: true }).click();
    await page.getByText('追加済み（登録済）').waitFor();
    await imagesLoaded(page);
    await shotDialog(ctx, 'search-results');

    // 検索結果が 0 件
    page = await ctx.freshPage();
    await open(page);
    await mockJson(page, '**/api/videos/search**', { videos: [], total: 0 });
    await page.getByRole('button', { name: '動画を検索して追加' }).click();
    await page.getByLabel('検索キーワード').fill('存在しないキーワード');
    await page.getByRole('button', { name: '検索', exact: true }).click();
    await page.getByText('該当する動画が見つかりませんでした').waitFor();
    await shotDialog(ctx, 'search-empty');

    // 検索に失敗した
    page = await ctx.freshPage();
    await open(page);
    await mockJson(page, '**/api/videos/search**', { error: '動画検索に失敗しました' }, 500);
    await page.getByRole('button', { name: '動画を検索して追加' }).click();
    await page.getByLabel('検索キーワード').fill('作業用BGM');
    await page.getByRole('button', { name: '検索', exact: true }).click();
    await errorAlert(page).waitFor();
    await shotDialog(ctx, 'search-error');
  },
};

const videos: Scenario = {
  screen: 'videos',
  async run(ctx) {
    const open = async (page: Page, url = '/mylist') => {
      await stubThumbnails(page);
      await normalizeVideoResponses(page);
      await page.goto(url);
      await videosLoaded(page);
      await settleNetwork(page);
    };

    // 通常表示 (1 ページ目。お気に入りとスキップが混ざる)
    await ctx.resetData(SEED_LIST);
    let page = await ctx.freshPage();
    await open(page);
    await ctx.shot('default', { viewportOnly: true });

    // 一覧の下端 (ページ送り)
    await page.getByText(/件中 1 - 20 件を表示/).scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await ctx.shot('pagination', { viewportOnly: true });

    // お気に入りだけに絞り込んだ
    page = await ctx.freshPage();
    await open(page, '/mylist?favorite=true');
    await ctx.shot('filtered', { viewportOnly: true });

    // 動画の詳細ダイアログ
    await ctx.resetData(SEED_FEW);
    page = await ctx.freshPage();
    await open(page);
    await page
      .getByRole('heading', { name: /猫がキーボード/ })
      .first()
      .click();
    await dialog(page).waitFor();
    await page.getByText('動画詳細').waitFor();
    await dialog(page).locator('img').first().waitFor();
    await imagesLoaded(page);
    await shotDialog(ctx, 'detail-dialog');

    // メモを書き換えて、保存せずに閉じようとした
    await dialog(page).getByLabel('メモ').fill('作業用 BGM の候補 (編集中)');
    await dialog(page).getByRole('button', { name: '閉じる', exact: true }).last().click();
    await page.getByText('保存していないメモがあります').waitFor();
    await shotDialog(ctx, 'discard-confirm');

    // 動画の削除の確認 (ダイアログの中に出る)
    page = await ctx.freshPage();
    await open(page);
    await page
      .getByRole('heading', { name: /猫がキーボード/ })
      .first()
      .click();
    await dialog(page).waitFor();
    await dialog(page).getByRole('button', { name: '動画を削除' }).click();
    await page.getByText('この動画を削除してもよろしいですか').waitFor();
    // 確認はダイアログの下端に出るため、見えるところまで送る
    await dialog(page)
      .locator('.MuiDialogContent-root')
      .evaluate((element) => element.scrollTo(0, element.scrollHeight));
    await ctx.shot('delete-confirm', { viewportOnly: true });

    // 動画がない
    await ctx.resetData({});
    page = await ctx.freshPage();
    await normalizeVideoResponses(page);
    await page.goto('/mylist');
    await ready(page, '動画が見つかりませんでした');
    await ctx.shot('empty', { viewportOnly: true });

    // 一覧の取得に失敗した
    page = await ctx.freshPage();
    await mockJson(
      page,
      /\/api\/videos(\?.*)?$/,
      { error: { code: 'DATABASE_ERROR', message: 'データベースへのアクセスに失敗しました' } },
      500
    );
    await page.goto('/mylist');
    await errorAlert(page).waitFor();
    await ctx.shot('fetch-error', { viewportOnly: true });
  },
};

const mylistRegister: Scenario = {
  screen: 'mylist-register',
  async run(ctx) {
    const open = async (page: Page, status: SessionStatus) => {
      await mockSession(page, status);
      await page.goto('/mylist/register');
      await ready(page, 'マイリスト登録設定');
    };
    const name = (page: Page) => page.getByLabel('マイリスト名');
    const submit = (page: Page) => page.getByRole('button', { name: /マイリストに登録|登録中/ });
    await ctx.resetData({ session: true });

    // 通常表示 (セッションが有効)
    let page = await ctx.freshPage();
    await open(page, SESSION_VALID);
    await page.getByText('有効（あと 25 日）').waitFor();
    await ctx.shot('default', { viewportOnly: true });

    // セッション管理ダイアログ
    await page.getByRole('button', { name: 'セッション管理ダイアログを開く' }).click();
    await dialog(page).waitFor();
    await shotDialog(ctx, 'session-dialog');

    // セッションの保存に失敗した (ニコニコ側で無効と判定された)
    await dialog(page).getByLabel('user_session').fill('0000000000000000000000000000dummy');
    await mockJson(
      page,
      '**/api/niconico/session',
      {
        error: 'INVALID_SESSION',
        message:
          'user_session が無効です。シークレット窓でニコニコ動画にログインし、最新の user_session を取得してください',
      },
      400
    );
    await page.route('**/api/niconico/session', (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(SESSION_VALID),
          })
        : route.fallback()
    );
    await dialog(page).getByRole('button', { name: 'セッションを保存' }).click();
    await errorAlert(page).filter({ hasText: 'user_session が無効です' }).waitFor();
    await shotDialog(ctx, 'session-save-error');

    // セッションの削除の確認
    await dialog(page)
      .getByRole('button', { name: 'セッションを削除', exact: true })
      .last()
      .click();
    await page.getByText('セッションを削除しますか？').waitFor();
    await shotDialog(ctx, 'session-delete-confirm');

    // セッションが無効 (登録できず、更新を促す)
    page = await ctx.freshPage();
    await open(page, SESSION_INVALID);
    await page.getByText('ニコニコセッションが無効です').waitFor();
    await ctx.shot('session-invalid', { viewportOnly: true });

    // セッションが未登録
    page = await ctx.freshPage();
    await open(page, SESSION_NONE);
    await page.getByText('ニコニコセッションが未登録です').waitFor();
    await ctx.shot('session-none', { viewportOnly: true });

    // セッションの有効性を判定できない (登録は押せる)
    page = await ctx.freshPage();
    await open(page, SESSION_UNKNOWN);
    await page.getByText('判定不能').first().waitFor();
    await ctx.shot('session-unknown', { viewportOnly: true });

    // セッションの状態を取得できなかった
    page = await ctx.freshPage();
    await mockJson(
      page,
      '**/api/niconico/session',
      { error: 'SESSION_STATUS_ERROR', message: 'セッション状態の取得に失敗しました' },
      500
    );
    await page.goto('/mylist/register');
    await page.getByText('取得失敗').waitFor();
    await ctx.shot('session-fetch-error', { viewportOnly: true });

    // 登録件数が範囲外
    page = await ctx.freshPage();
    await open(page, SESSION_VALID);
    await page.getByLabel('登録する最大動画数').fill('150');
    await name(page).fill('作業用 BGM');
    await submit(page).click();
    await errorAlert(page).waitFor();
    await ctx.shot('input-error', { viewportOnly: true });

    // 登録できる動画がない (動画を取り込んでいない。サーバーが選べる動画の数を数えて弾く)
    await ctx.resetData({ session: true });
    page = await ctx.freshPage();
    await open(page, SESSION_VALID);
    await name(page).fill('作業用 BGM');
    await submit(page).click();
    await page.getByText('登録可能な動画が見つかりませんでした').waitFor();
    await ctx.shot('no-videos', { viewportOnly: true });

    // 登録中 (応答が返らない)
    page = await ctx.freshPage();
    await open(page, SESSION_VALID);
    await hold(page, '**/api/mylist/register', 'POST');
    await name(page).fill('作業用 BGM');
    await submit(page).click();
    await page.locator('button[aria-busy="true"]').waitFor();
    await ctx.shot('submitting', { viewportOnly: true });

    // 登録を依頼した (数秒後にステータス画面へ移る)
    page = await ctx.freshPage();
    await open(page, SESSION_VALID);
    await mockJson(page, '**/api/mylist/register', {
      jobId: JOB_ID,
      status: 'SUBMITTED',
      message: 'バッチジョブを投入しました',
      estimatedVideos: 30,
      selectedCount: 30,
    });
    await hold(page, `**/api/batch/status/${JOB_ID}`);
    await page.getByLabel('登録する最大動画数').fill('30');
    await name(page).fill('作業用 BGM');
    await submit(page).click();
    await page.getByText('ステータス確認画面に移動します').waitFor();
    await ctx.shot('submitted', { viewportOnly: true });
  },
};

type JobStatus = 'SUBMITTED' | 'RUNNING' | 'WAITING_FOR_2FA' | 'SUCCEEDED' | 'FAILED';

function job(status: JobStatus, extra: Record<string, unknown> = {}) {
  const created = NOW - 12 * 60 * 1000;
  return {
    jobId: JOB_ID,
    status,
    createdAt: new Date(created).toISOString(),
    updatedAt: new Date(NOW - 60 * 1000).toISOString(),
    ...extra,
  };
}

const jobStatus: Scenario = {
  screen: 'job-status',
  async run(ctx) {
    await ctx.resetData({});
    const open = async (page: Page, body: unknown, status = 200) => {
      await mockJson(page, `**/api/batch/status/${JOB_ID}`, body, status);
      await page.goto(`/mylist/status/${JOB_ID}`);
      await ready(page, 'ジョブID');
    };

    // 取得中 (最初の応答を待っている)
    let page = await ctx.freshPage();
    await hold(page, `**/api/batch/status/${JOB_ID}`);
    await page.goto(`/mylist/status/${JOB_ID}`);
    await page.locator('[role="progressbar"]').first().waitFor();
    await ctx.shot('loading', { viewportOnly: true });

    // 投入済み (バッチの起動待ち)
    page = await ctx.freshPage();
    await open(page, job('SUBMITTED'));
    await page.getByText('ジョブの実行を待機中').waitFor();
    await ctx.shot('submitted', { viewportOnly: true });

    // 実行中
    page = await ctx.freshPage();
    await open(page, job('RUNNING'));
    await page.getByText('マイリスト登録処理を実行中').waitFor();
    await ctx.shot('running', { viewportOnly: true });

    // 二段階認証待ち (コードの入力欄が出る)
    page = await ctx.freshPage();
    await open(page, job('WAITING_FOR_2FA'));
    await page.getByLabel('二段階認証コード').fill('12');
    await page.getByRole('button', { name: 'コードを送信' }).waitFor();
    await ctx.shot('waiting-for-2fa', { viewportOnly: true });

    // 完了 (一部の動画は登録に失敗している)
    page = await ctx.freshPage();
    await open(
      page,
      job('SUCCEEDED', {
        completedAt: new Date(NOW - 30 * 1000).toISOString(),
        result: { registeredCount: 28, failedCount: 2, totalCount: 30 },
      })
    );
    await page.getByText('マイリスト登録が完了しました！').waitFor();
    await ctx.shot('succeeded', { viewportOnly: true });

    // 失敗 (全件失敗)
    page = await ctx.freshPage();
    await open(
      page,
      job('FAILED', {
        completedAt: new Date(NOW - 30 * 1000).toISOString(),
        result: {
          registeredCount: 0,
          failedCount: 0,
          totalCount: 0,
          errorMessage: 'user_session が無効です。再取得してください',
        },
      })
    );
    await page.getByText('マイリスト登録に失敗しました').waitFor();
    await ctx.shot('failed', { viewportOnly: true });

    // ジョブが見つからない (ポーリングを止める)
    page = await ctx.freshPage();
    await open(
      page,
      { error: { code: 'NOT_FOUND', message: 'バッチジョブが見つかりません' } },
      404
    );
    await errorAlert(page).waitFor();
    await ctx.shot('not-found', { viewportOnly: true });

    // 取得に失敗した (一時的な失敗として、ポーリングを続ける)
    page = await ctx.freshPage();
    await page.route(`**/api/batch/status/${JOB_ID}`, (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'INTERNAL_ERROR', message: '内部エラーが発生しました' }),
      })
    );
    await page.goto(`/mylist/status/${JOB_ID}`);
    await errorAlert(page).waitFor();
    await ctx.shot('fetch-error', { viewportOnly: true });
  },
};

export const niconicoMylistAssistant: ServiceCapture = {
  service: 'niconico-mylist-assistant',
  // 要件・設計は、スマホ向けか PC 向けかを一つに決めていない。画面は狭い幅と広い幅の両方で崩れない作りで、
  // E2E も 390px と 1280px の両方でレイアウトを確かめている
  devices: ['mobile', 'desktop'],
  server: {
    cwd: 'services/niconico-mylist-assistant/web',
    build: ['npm', 'run', 'build'],
    command: ['npm', 'run', 'start', '--'],
    port: 3404,
    healthPath: '/api/health',
    envFile: 'services/niconico-mylist-assistant/web/.env.test',
    requiredBuilds: [
      'libs/ui/dist',
      'libs/nextjs/dist',
      'libs/aws/dist',
      'libs/common/dist',
      'libs/browser/dist',
      'libs/react/dist',
      'services/niconico-mylist-assistant/core/dist',
    ],
    // E2E の環境変数ファイルは 3000 番を前提にしているため、撮影用のポートに合わせる
    extraEnv: {
      BASE_URL: 'http://localhost:3404',
      NEXTAUTH_URL: 'http://localhost:3404',
      APP_URL: 'http://localhost:3404',
    },
  },
  // 認証はテスト用に常にログイン済みで、このサービスはロールで操作を分けない
  defaultRoles: [],
  fixedTime: FIXED_TIME,
  resetData: resetNiconicoData,
  scenarios: [home, importScreen, videos, mylistRegister, jobStatus],
};
