/**
 * マイリスト登録フローの統合テスト
 *
 * 実アカウントの user_session クッキーが要る手元専用のテストで、CI では流さない。
 * 本体 (src/playwright-automation.ts) が使うセレクタの動作確認と、ニコニコ動画の UI 変更の
 * 早期検知が目的。テスト内で独自のセレクタを持たず、本体の関数を呼んでコードパスを通す。
 *
 * 注意: Step 3 と Step 4 は deleteAllMylists で対象アカウントの既存マイリストを全て削除する。
 * 必ずテスト専用のアカウントを使うこと。
 *
 * 必要な環境変数:
 * - NICONICO_TEST_USER_SESSION (必須): テスト用アカウントの user_session クッキー値。
 *   ブラウザで正規にログインしたあと、開発者ツールの Cookie から nicovideo.jp の
 *   user_session の値をコピーする
 * - TEST_VIDEO_IDS (任意): 登録テストに使う動画 ID のカンマ区切り (例: sm9,sm10)。
 *   未設定なら Step 4 はスキップされる
 *
 * 実行手順:
 * 1. .env.local.example を .env.local にコピーし、上記の環境変数を設定する
 * 2. npm run test:integration --workspace=@nagiyu/niconico-mylist-assistant-batch
 * 3. ブラウザを表示する場合: HEADLESS=false を付けて実行する
 * 4. デバッグモード: PWDEBUG=1 を付けて実行する
 */

import { test, expect } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import {
  createContextWithSession,
  createMylist,
  deleteAllMylists,
  registerOverlayBannerHandler,
  registerVideoToMylist,
} from '../../src/playwright-automation';
import { NICONICO_URLS } from '../../src/constants';

const ERROR_MESSAGES = {
  USER_SESSION_REQUIRED:
    '環境変数 NICONICO_TEST_USER_SESSION が必要です。.env.local ファイルを作成して設定してください。',
} as const;

const TEST_USER_SESSION = process.env.NICONICO_TEST_USER_SESSION;
const TEST_VIDEO_IDS = (process.env.TEST_VIDEO_IDS ?? '')
  .split(',')
  .map((id) => id.trim())
  .filter((id) => id.length > 0);

test.describe('マイリスト登録フロー', () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(() => {
    if (!TEST_USER_SESSION) {
      throw new Error(ERROR_MESSAGES.USER_SESSION_REQUIRED);
    }
  });

  test.beforeEach(async ({ browser }) => {
    context = await createContextWithSession(browser, TEST_USER_SESSION!);
    page = await context.newPage();
    await registerOverlayBannerHandler(page);
  });

  test.afterEach(async () => {
    await context.close();
  });

  /**
   * Step 1: user_session でログイン状態になる
   *
   * セッションが失効していると、マイリストページがログインページへリダイレクトされる。
   * テストが落ちたときにセレクタ変更とセッション失効を切り分けられるよう最初に置く。
   */
  test('Step 1: user_session でログイン状態になる', async () => {
    await page.goto(NICONICO_URLS.MYLIST, { waitUntil: 'domcontentloaded' });

    expect(page.url()).not.toContain('account.nicovideo.jp');
    await expect(page).toHaveURL(/nicovideo\.jp\/my\/mylist/);
  });

  /**
   * Step 2: マイリストページが表示できる
   *
   * deleteAllMylists が待機対象にしている要素が存在することで、
   * 本体が前提とするページ構造が変わっていないことを確認する。
   */
  test('Step 2: マイリストページが表示できる', async () => {
    await page.goto(NICONICO_URLS.MYLIST, { waitUntil: 'domcontentloaded' });

    const mylistList = page.locator('.MylistSideContainer-mylistList');
    const emptyMessage = page.getByText('マイリストがありません');
    await expect(mylistList.or(emptyMessage).first()).toBeAttached({ timeout: 15000 });
  });

  /**
   * Step 3: マイリストを作成して削除できる
   *
   * createMylist で作成したマイリストが表示され、deleteAllMylists で消えることを確認する。
   */
  test('Step 3: マイリストを作成して削除できる', async () => {
    const mylistName = `テストマイリスト_${Date.now()}`;

    await createMylist(page, mylistName);
    await expect(page.getByText(mylistName).first()).toBeVisible({ timeout: 10000 });

    await deleteAllMylists(page);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText(mylistName)).toHaveCount(0);
  });

  /**
   * Step 4: 動画をマイリストに登録できる
   *
   * registerVideoToMylist が動画ページのメニュー操作を最後まで通せることを確認する。
   * 登録に失敗すると本体の関数が例外を投げる。
   */
  test('Step 4: 動画をマイリストに登録できる', async () => {
    test.skip(TEST_VIDEO_IDS.length === 0, 'TEST_VIDEO_IDS が未設定のためスキップします');

    const mylistName = `テスト動画登録_${Date.now()}`;

    await deleteAllMylists(page);
    await createMylist(page, mylistName);

    await registerVideoToMylist(page, TEST_VIDEO_IDS[0], mylistName);
  });
});
