/**
 * Playwright を使用したニコニコ動画マイリスト自動化サービス
 */

import { chromium, Browser, Page } from 'playwright';
import { ERROR_MESSAGES, NICONICO_URLS, TIMEOUTS, VIDEO_REGISTRATION_WAIT } from './constants';
import { MylistRegistrationResult } from './types';
import { retry, sleep } from './utils';

/**
 * ニコニコ動画にログインする
 *
 * @param page Playwright Page オブジェクト
 * @param email ニコニコ動画のメールアドレス
 * @param password ニコニコ動画のパスワード
 */
export async function login(page: Page, email: string, password: string): Promise<void> {
  console.log('ニコニコ動画にログイン中...');

  try {
    // ログインページに移動
    await page.goto(NICONICO_URLS.LOGIN, {
      timeout: TIMEOUTS.NAVIGATION,
      waitUntil: 'networkidle',
    });

    // メールアドレス入力
    await page.fill('input[name="mail_tel"]', email);

    // パスワード入力
    await page.fill('input[name="password"]', password);

    // ログインボタンをクリック
    await page.click('button[type="submit"]');

    // ログイン完了を待つ（URL遷移を確認）
    await page.waitForURL('**', { timeout: TIMEOUTS.LOGIN });

    console.log('ログイン成功');
  } catch (error) {
    console.error('ログイン失敗:', error);
    throw new Error(ERROR_MESSAGES.LOGIN_FAILED);
  }
}

/**
 * 既存のマイリストを全て削除する
 *
 * @param page Playwright Page オブジェクト
 */
export async function deleteAllMylists(page: Page): Promise<void> {
  console.log('既存のマイリストを削除中...');

  try {
    // マイリストページに移動
    await page.goto(NICONICO_URLS.MYLIST, {
      timeout: TIMEOUTS.NAVIGATION,
      waitUntil: 'networkidle',
    });

    // マイリストの削除ボタンを全て取得して削除
    // 注: 実際のセレクタはニコニコ動画のHTMLに依存
    // ここではプレースホルダーとして記述
    const deleteButtons = await page.$$('[data-testid="mylist-delete"]');

    for (const button of deleteButtons) {
      await button.click();
      // 確認ダイアログがある場合は承認
      try {
        await page.click('[data-testid="confirm-delete"]');
      } catch {
        // 確認ダイアログがない場合はスキップ（ログ出力なし）
      }
      await sleep(1000); // 削除処理の完了を待つ
    }

    console.log(`${deleteButtons.length}件のマイリストを削除しました`);
  } catch (error) {
    console.error('マイリスト削除失敗:', error);
    throw new Error(ERROR_MESSAGES.MYLIST_DELETE_FAILED);
  }
}

/**
 * 新しいマイリストを作成する
 *
 * @param page Playwright Page オブジェクト
 * @param mylistName マイリスト名
 */
export async function createMylist(page: Page, mylistName: string): Promise<void> {
  console.log(`マイリスト「${mylistName}」を作成中...`);

  try {
    // マイリストページに移動（既に移動済みの場合はスキップ）
    if (!page.url().includes(NICONICO_URLS.MYLIST)) {
      await page.goto(NICONICO_URLS.MYLIST, {
        timeout: TIMEOUTS.NAVIGATION,
        waitUntil: 'networkidle',
      });
    }

    // マイリスト作成ボタンをクリック
    await page.click('[data-testid="create-mylist"]');

    // マイリスト名を入力
    await page.fill('[data-testid="mylist-name-input"]', mylistName);

    // 作成ボタンをクリック
    await page.click('[data-testid="submit-create-mylist"]');

    await sleep(2000); // 作成処理の完了を待つ

    console.log('マイリスト作成成功');
  } catch (error) {
    console.error('マイリスト作成失敗:', error);
    throw new Error(ERROR_MESSAGES.MYLIST_CREATE_FAILED);
  }
}

/**
 * 動画をマイリストに登録する
 *
 * @param page Playwright Page オブジェクト
 * @param videoId 動画ID
 * @param mylistName マイリスト名
 */
export async function registerVideoToMylist(
  page: Page,
  videoId: string,
  mylistName: string
): Promise<void> {
  try {
    // 動画ページに移動
    await page.goto(`${NICONICO_URLS.VIDEO}${videoId}`, {
      timeout: TIMEOUTS.NAVIGATION,
      waitUntil: 'networkidle',
    });

    // マイリストボタンをクリック
    await page.click('[data-testid="mylist-button"]', {
      timeout: TIMEOUTS.VIDEO_REGISTRATION,
    });

    // マイリストを選択
    await page.click(`[data-testid="mylist-option-${mylistName}"]`, {
      timeout: TIMEOUTS.VIDEO_REGISTRATION,
    });

    console.log(`動画 ${videoId} を登録しました`);
  } catch (error) {
    console.error(`動画 ${videoId} の登録失敗:`, error);
    throw new Error(`${ERROR_MESSAGES.VIDEO_REGISTRATION_FAILED}: ${videoId}`);
  }
}

/**
 * 複数の動画をマイリストに登録する
 *
 * @param page Playwright Page オブジェクト
 * @param videoIds 動画IDのリスト
 * @param mylistName マイリスト名
 * @returns 登録結果
 */
export async function registerVideosToMylist(
  page: Page,
  videoIds: string[],
  mylistName: string
): Promise<MylistRegistrationResult> {
  const successVideoIds: string[] = [];
  const failedVideoIds: string[] = [];

  console.log(`${videoIds.length}件の動画を登録開始...`);

  for (let i = 0; i < videoIds.length; i++) {
    const videoId = videoIds[i];

    try {
      // リトライ機能付きで動画を登録
      await retry(async () => {
        await registerVideoToMylist(page, videoId, mylistName);
      });

      successVideoIds.push(videoId);

      // 2秒待機（ニコニコ動画サーバーへの配慮）
      if (i < videoIds.length - 1) {
        console.log('2秒待機中...');
        await sleep(VIDEO_REGISTRATION_WAIT);
      }
    } catch (error) {
      console.error(`動画 ${videoId} の登録に失敗しました:`, error);
      failedVideoIds.push(videoId);
    }
  }

  console.log(`登録完了: 成功 ${successVideoIds.length}件, 失敗 ${failedVideoIds.length}件`);

  return {
    successVideoIds,
    failedVideoIds,
  };
}

/**
 * スクリーンショット保存先ディレクトリ
 * Docker コンテナ内では /tmp を使用
 */
const SCREENSHOT_DIR = '/tmp';

/**
 * スクリーンショットを取得して保存する（デバッグ用）
 *
 * @param page Playwright Page オブジェクト
 * @param filename ファイル名（拡張子なし）
 */
export async function takeScreenshot(page: Page, filename: string): Promise<void> {
  try {
    const path = `${SCREENSHOT_DIR}/${filename}.png`;
    await page.screenshot({ path, fullPage: true });
    console.log(`スクリーンショット保存: ${path}`);
  } catch (error) {
    console.error('スクリーンショット取得失敗:', error);
    // スクリーンショット取得の失敗は致命的ではないため、エラーをスローしない
  }
}

/**
 * ブラウザを起動する
 *
 * @returns Browser オブジェクト
 */
export async function launchBrowser(): Promise<Browser> {
  try {
    console.log('ブラウザを起動中...');

    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    console.log('ブラウザ起動成功');
    return browser;
  } catch (error) {
    console.error('ブラウザ起動失敗:', error);
    throw new Error(ERROR_MESSAGES.BROWSER_LAUNCH_FAILED);
  }
}

/**
 * マイリスト登録処理のメイン関数
 *
 * @param email ニコニコ動画のメールアドレス
 * @param password ニコニコ動画のパスワード
 * @param mylistName マイリスト名
 * @param videoIds 登録する動画IDのリスト
 * @returns 登録結果
 */
export async function executeMylistRegistration(
  email: string,
  password: string,
  mylistName: string,
  videoIds: string[]
): Promise<MylistRegistrationResult> {
  let browser: Browser | undefined;
  let page: Page | undefined;

  try {
    // ブラウザ起動
    browser = await launchBrowser();
    page = await browser.newPage();

    // ログイン
    await login(page, email, password);
    await takeScreenshot(page, 'after-login');

    // 既存マイリストを削除
    await deleteAllMylists(page);
    await takeScreenshot(page, 'after-delete-mylists');

    // 新しいマイリストを作成
    await createMylist(page, mylistName);
    await takeScreenshot(page, 'after-create-mylist');

    // 動画を登録
    const result = await registerVideosToMylist(page, videoIds, mylistName);
    await takeScreenshot(page, 'after-register-videos');

    return result;
  } catch (error) {
    // エラー時のスクリーンショット
    if (page) {
      await takeScreenshot(page, 'error-screenshot');
    }

    const errorMessage = error instanceof Error ? error.message : ERROR_MESSAGES.UNKNOWN_ERROR;

    console.error('マイリスト登録処理でエラーが発生しました:', errorMessage);

    return {
      successVideoIds: [],
      failedVideoIds: videoIds,
      errorMessage,
    };
  } finally {
    // ブラウザを閉じる
    if (browser) {
      await browser.close();
      console.log('ブラウザを閉じました');
    }
  }
}
