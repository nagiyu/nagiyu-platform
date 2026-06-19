/**
 * Playwright を使用したニコニコ動画マイリスト自動化サービス
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { sleep, toErrorMessage, withRetry } from '@nagiyu/common';
import type { RetryOptions } from '@nagiyu/common';
import {
  DEFAULT_RETRY_CONFIG,
  ERROR_MESSAGES,
  NICONICO_URLS,
  TIMEOUTS,
  VIDEO_REGISTRATION_WAIT,
} from './constants.js';
import { MylistRegistrationResult } from './types.js';
import { createS3Client, uploadFile, getS3ObjectUrl, reportErrorEvent } from '@nagiyu/aws';
import { readFile } from 'fs/promises';

const VIDEO_RETRY_OPTIONS: Pick<
  RetryOptions,
  'maxRetries' | 'initialDelayMs' | 'backoffMultiplier'
> = {
  maxRetries: DEFAULT_RETRY_CONFIG.maxRetries,
  initialDelayMs: DEFAULT_RETRY_CONFIG.initialDelayMs,
  backoffMultiplier: 1,
};

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
      waitUntil: 'domcontentloaded', // networkidle は広告等で時間がかかるため domcontentloaded に変更
    });

    // ページの JavaScript が実行されてマイリストカウントが更新されるまで待機
    await sleep(2000);

    // マイリストコンテナが DOM に存在することを確認（マイリストがない場合も OK）
    // これにより、動的にロードされるコンテンツの準備が完了したことを確認
    try {
      // マイリストコンテナまたは「マイリストがありません」メッセージを待つ
      await Promise.race([
        page.locator('.MylistSideContainer-mylistList').waitFor({
          state: 'attached',
          timeout: 10000,
        }),
        page.locator('text=マイリストがありません').waitFor({
          state: 'visible',
          timeout: 10000,
        }),
      ]).catch(() => {
        console.log('マイリストコンテナの確認: タイムアウト（コンテンツが動的にロード中の可能性）');
      });

      // コンテナが表示された後、さらに少し待機してリストアイテムがレンダリングされるのを待つ
      await sleep(1000);
    } catch (error) {
      console.log('マイリストコンテナの待機でエラー（続行します）:', error);
    }

    let deletedCount = 0;

    // アラートダイアログを承認するハンドラを設定（ループの外で一度だけ）
    page.on('dialog', async (dialog) => {
      console.log(`ダイアログ検出: ${dialog.message()}`);
      await dialog.accept();
      console.log('ダイアログを承認しました');
    });

    // マイリスト数が0になるまで削除を繰り返す
    while (true) {
      try {
        // マイリストアイテムを直接カウント（カウンター要素ではなくリストアイテムで判断）
        const mylistItems = page.locator('.MylistSideContainer-mylistList li');
        const mylistCount = await mylistItems.count();

        // デバッグ: コンテナの存在確認
        const containerExists = await page.locator('.MylistSideContainer-mylistList').count();
        console.log(`マイリストコンテナの存在: ${containerExists}個`);
        console.log(`現在のマイリスト数（リストアイテム数）: ${mylistCount}`);

        if (mylistCount === 0) {
          // マイリストが0件の場合、本当に0件なのか、まだロードされていないのかを確認
          const noMylistMessage = await page.locator('text=マイリストがありません').count();
          console.log(
            `「マイリストがありません」メッセージの表示: ${noMylistMessage > 0 ? 'あり' : 'なし'}`
          );

          if (noMylistMessage > 0 || containerExists === 0) {
            console.log('マイリスト数が0件になりました。削除処理を終了します。');
            break;
          } else {
            // コンテナは存在するがアイテムが0件 = まだロード中の可能性
            console.log('コンテナは存在するがアイテムが0件です。もう少し待機します...');
            await sleep(2000);
            continue; // ループを続けて再カウント
          }
        }

        console.log(`マイリストを削除します（残り: ${mylistCount}件）`);
      } catch (countError) {
        console.error('マイリスト数の取得でエラー:', countError);
        // スクリーンショット取得エラーで元のエラーコンテキストを失わないようにする
        try {
          await takeScreenshot(page, `count-error-${deletedCount}`);
        } catch (screenshotError) {
          console.error('スクリーンショット取得失敗:', screenshotError);
        }
        throw countError;
      }

      // ダウンロードした HTML から特定したセレクタを使用
      try {
        // Step 1: サイドバーの最初のマイリストリンクをクリックして詳細ページへ移動
        // 要素が完全に表示されるまで待機
        const firstMylistLink = page.locator('.MylistSideContainer-mylistList li:first-child a');
        await firstMylistLink.waitFor({ state: 'visible', timeout: 30000 });
        console.log('マイリストリンクが表示されました');

        // クリック可能になるまで待機してからクリック（overlayがある可能性を考慮）
        await firstMylistLink.click({ timeout: 30000, force: false });
        console.log('マイリスト詳細ページへ移動しました');
        await sleep(3000); // ページ遷移とJavaScript実行を待つ

        // Step 2: マイリストヘッダーの3点メニューボタンをクリック
        const threePointMenuButton = page.locator('.NC-ThreePointMenu.MylistHeaderMenu button');
        await threePointMenuButton.waitFor({ state: 'visible', timeout: 30000 });
        console.log('3点メニューボタンが表示されました');

        // noWaitAfter: true でナビゲーション待機をスキップ（メニュー展開なのでナビゲーションは発生しない）
        await threePointMenuButton.click({ timeout: 30000, noWaitAfter: true });
        console.log('3点メニューを開きました');
        await sleep(2000); // メニューが完全に表示されるまで待機

        // Step 3: メニュー内の削除ボタンをクリック
        // メニューが開いた後、削除ボタンを探す（過去実績では3番目のボタン）
        // メニューは動的に表示されるので、.NC-ThreePointMenu-menu 内のボタンを探す
        const menuContainer = page.locator('.NC-ThreePointMenu-menu');
        await menuContainer.waitFor({ state: 'visible', timeout: 30000 });
        console.log('メニューコンテナが表示されました');

        const deleteButton = menuContainer.locator('button').nth(2);
        await deleteButton.waitFor({ state: 'visible', timeout: 30000 });
        console.log('削除ボタンが表示されました');

        await deleteButton.click({ timeout: 30000 });
        console.log('削除ボタンをクリックしました');

        // アラートダイアログの承認を待つ（dialog ハンドラが自動で処理）
        await sleep(1000);
      } catch (stepError) {
        console.error('削除ステップでエラー:', stepError);
        // エラー時のスクリーンショット
        await takeScreenshot(page, `delete-error-${deletedCount}`);
        throw stepError;
      }

      deletedCount++;

      // ページをリロードして最新状態を取得
      await page.goto(NICONICO_URLS.MYLIST, {
        timeout: TIMEOUTS.NAVIGATION,
        waitUntil: 'domcontentloaded',
      });
      await sleep(2000); // カウント更新待ち
    }

    console.log(`${deletedCount}件のマイリストを削除しました`);
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
        waitUntil: 'domcontentloaded', // networkidle は広告等で時間がかかるため domcontentloaded に変更
      });
    }

    // ページがロードされてJavaScriptが実行されるまで待機
    await sleep(3000);

    // マイリスト作成ボタンをクリック（ニコニコUI刷新後のセレクタ）
    const createButton = page.locator('button', { hasText: '新規作成' }).first();
    await createButton.waitFor({ state: 'visible', timeout: 30000 });
    console.log('マイリスト新規作成ボタンが表示されました');

    await createButton.click({ timeout: 30000 });
    console.log('マイリスト新規作成ボタンをクリックしました');

    // モーダルの表示を待つ
    await sleep(2000);

    // モーダルコンテナの表示を確認し、参照を保持
    const modalContainer = page.locator('.MylistCreateModalContainer');
    await modalContainer.waitFor({ state: 'visible', timeout: 30000 });
    console.log('マイリスト作成モーダルが表示されました');

    // マイリスト名を入力（React 制御入力なのでキーボード実入力）
    const nameInput = modalContainer.locator('input[type="text"]').first();
    await nameInput.waitFor({ state: 'visible', timeout: 30000 });
    console.log('マイリスト名入力フィールドが表示されました');

    await nameInput.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Delete');
    await page.keyboard.type(mylistName, { delay: 20 });
    console.log(`マイリスト名を入力しました: ${mylistName}`);

    // 作成ボタンをクリック
    const submitButton = modalContainer.getByRole('button', { name: '作成', exact: true });
    await submitButton.waitFor({ state: 'visible', timeout: 30000 });
    console.log('作成ボタンが表示されました');

    // モーダルが完全に表示されるまで待機
    await sleep(500);

    // オーバーレイが原因でクリックできない場合は、JavaScriptでクリック
    try {
      // 通常のクリックを試みる（オーバーレイがない場合）
      await submitButton.click({ timeout: 5000 });
      console.log('モーダルの作成ボタンをクリックしました（通常クリック）');
    } catch {
      console.log('通常クリックが失敗しました。JavaScriptクリックを試みます...');
      // JavaScriptを使用して直接クリックイベントを発火
      await submitButton.evaluate((button) => (button as HTMLElement).click());
      console.log('モーダルの作成ボタンをクリックしました（JavaScriptクリック）');
    }

    // モーダルが閉じるまで待機
    await sleep(2000);

    // マイリスト作成の完了を待つ
    await sleep(2000);

    // マイリストが作成されたことを確認
    // サイドバーに名前が現れるか確認（必要ならページ再読込）
    try {
      const sidebarItems = page.locator('.MylistSideContainer-mylistList li');
      await sidebarItems.first().waitFor({ state: 'attached', timeout: 10000 });
      const count = await sidebarItems.count();
      console.log(`マイリスト作成成功（確認: ${count}件のマイリストが存在）`);
    } catch {
      // 確認できなかった場合はページをリロードして再確認
      console.log('サイドバー確認のためページをリロードします...');
      await page.goto(NICONICO_URLS.MYLIST, {
        timeout: TIMEOUTS.NAVIGATION,
        waitUntil: 'domcontentloaded',
      });
      await sleep(2000);
      const sidebarItems = page.locator('.MylistSideContainer-mylistList li');
      const count = await sidebarItems.count();
      console.log(`マイリスト作成確認（リロード後: ${count}件のマイリストが存在）`);
    }
  } catch (error) {
    console.error('マイリスト作成失敗:', error);
    // エラー時のデバッグ情報を追加
    try {
      console.error(`[DEBUG] エラー時のURL: ${page.url()}`);
      await takeScreenshot(page, 'create-mylist-error');
    } catch (debugError) {
      console.error('[DEBUG] デバッグ情報の取得に失敗:', debugError);
    }
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
      waitUntil: 'domcontentloaded', // networkidle は広告等で時間がかかるため domcontentloaded に変更
    });

    // 動画が読み込まれるまで少し待つ
    await sleep(3000);

    // 3点メニューボタンをクリック（aria-label="メニュー"を使用、exact: true で完全一致）
    const menuButton = page.getByRole('button', { name: 'メニュー', exact: true });
    await menuButton.click({ timeout: TIMEOUTS.VIDEO_REGISTRATION });

    await sleep(500);

    // 「マイリストに追加」メニュー項目をクリック
    const addToMylistButton = page.getByText('マイリストに追加');
    await addToMylistButton.click({ timeout: TIMEOUTS.VIDEO_REGISTRATION });

    await sleep(1000);

    // マイリスト選択ダイアログでマイリストを選択
    const selectMylistButton = page.getByText(mylistName);
    await selectMylistButton.click({ timeout: TIMEOUTS.VIDEO_REGISTRATION });

    await sleep(2000); // 登録処理の完了を待つ

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
      await withRetry(async () => {
        await registerVideoToMylist(page, videoId, mylistName);
      }, VIDEO_RETRY_OPTIONS);

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
 * S3 バケット名（環境変数から取得、設定されていない場合は S3 アップロードをスキップ）
 */
const SCREENSHOT_BUCKET_NAME = process.env.SCREENSHOT_BUCKET_NAME;

/**
 * AWS リージョン（環境変数から取得）
 */
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

/**
 * S3 クライアント（バケット名が設定されている場合のみ初期化）
 */
const s3Client = SCREENSHOT_BUCKET_NAME ? createS3Client({ region: AWS_REGION }) : null;

/**
 * スクリーンショットを取得して保存する（デバッグ用）
 *
 * ローカルの /tmp に保存し、S3 バケットが設定されている場合は S3 にもアップロードする。
 *
 * @param page Playwright Page オブジェクト
 * @param filename ファイル名（拡張子なし）
 */
export async function takeScreenshot(page: Page, filename: string): Promise<void> {
  try {
    const path = `${SCREENSHOT_DIR}/${filename}.png`;
    await page.screenshot({ path, fullPage: true, timeout: 0 });
    console.log(`スクリーンショット保存: ${path}`);

    // S3 バケットが設定されている場合は S3 にアップロード
    if (SCREENSHOT_BUCKET_NAME && s3Client) {
      try {
        // タイムスタンプをファイル名に使用するため、ISO 8601 形式の特殊文字を置換
        // （S3 オブジェクトキーでは使用可能だが、可読性のために置換）
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const s3Key = `screenshots/${timestamp}-${filename}.png`;

        // ファイルを読み込んで S3 にアップロード
        const fileBuffer = await readFile(path);
        await uploadFile(s3Client, {
          bucketName: SCREENSHOT_BUCKET_NAME,
          key: s3Key,
          body: fileBuffer,
          contentType: 'image/png',
          metadata: {
            originalFilename: filename,
            timestamp: timestamp,
          },
        });

        const s3Url = getS3ObjectUrl(SCREENSHOT_BUCKET_NAME, s3Key, AWS_REGION);
        console.log(`スクリーンショットを S3 にアップロード: ${s3Url}`);
      } catch (s3Error) {
        console.error('S3 アップロード失敗:', s3Error);
        // S3 アップロードの失敗は致命的ではないため、処理は継続
      }
    }
  } catch (error) {
    console.error('スクリーンショット取得失敗:', error);
    // スクリーンショット取得の失敗は致命的ではないため、エラーをスローしない
  }
}

/**
 * ニコニコ動画のお知らせオーバーレイバナー（OverlayBannerFrame）が出現したとき自動的に閉じる
 * ハンドラを page に登録する。
 *
 * バナーが表示されない場合はハンドラが発火しないため、バナーの有無に関わらず安全に使える。
 *
 * @param page Playwright Page オブジェクト
 */
export async function registerOverlayBannerHandler(page: Page): Promise<void> {
  const overlayLocator = page.locator('.OverlayBannerFrame');

  await page.addLocatorHandler(
    overlayLocator,
    async () => {
      console.log('お知らせオーバーレイバナーを検出しました。閉じます...');
      try {
        const closeButton = page.locator('.OverlayBannerFrame button').first();
        const buttonCount = await closeButton.count();
        if (buttonCount > 0) {
          await closeButton.click({ timeout: 3000, force: true });
          console.log('オーバーレイバナーを閉じました');
        } else {
          await page.evaluate(() => {
            document.querySelector('.OverlayBannerFrame')?.remove();
            document.querySelector('.NC-Modal-overlay')?.remove();
          });
          console.log('オーバーレイバナーを DOM から除去しました');
        }
      } catch (error) {
        console.warn(
          'オーバーレイバナーの除去に失敗しました（処理は継続します）:',
          toErrorMessage(error)
        );
      }
    },
    { noWaitAfter: true }
  );
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
 * user_session クッキーを注入したブラウザコンテキストを作成する
 *
 * ログインも2FAも不要。user_session 単体で読み書きとも成立する。
 *
 * @param browser Browser オブジェクト
 * @param userSession ニコニコ動画の user_session クッキー値
 * @returns クッキー注入済みの BrowserContext
 */
export async function createContextWithSession(
  browser: Browser,
  userSession: string
): Promise<BrowserContext> {
  console.log('user_session クッキーを注入したコンテキストを作成中...');

  try {
    const context = await browser.newContext({ locale: 'ja-JP' });

    await context.addCookies([
      {
        name: 'user_session',
        value: userSession,
        domain: '.nicovideo.jp',
        path: '/',
        httpOnly: false,
        secure: true,
        sameSite: 'Lax',
      },
    ]);

    console.log('user_session クッキーの注入が完了しました');
    return context;
  } catch (error) {
    console.error('クッキー注入失敗:', error);
    throw new Error(ERROR_MESSAGES.SESSION_COOKIE_INJECTION_FAILED);
  }
}

/**
 * マイリスト登録処理のメイン関数
 *
 * @param userSession ニコニコ動画の user_session クッキー値
 * @param mylistName マイリスト名
 * @param videoIds 登録する動画IDのリスト
 * @returns 登録結果
 */
export async function executeMylistRegistration(
  userSession: string,
  mylistName: string,
  videoIds: string[]
): Promise<MylistRegistrationResult> {
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let page: Page | undefined;

  try {
    // ブラウザ起動
    browser = await launchBrowser();

    // user_session クッキーを注入したコンテキストを作成
    context = await createContextWithSession(browser, userSession);

    // ページを作成
    page = await context.newPage();

    // お知らせオーバーレイバナー自動 dismiss ハンドラを登録
    await registerOverlayBannerHandler(page);

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

    await reportErrorEvent({
      serviceId: 'niconico-mylist-assistant',
      severity: 'error',
      title: 'Playwright 自動化処理失敗',
      message: errorMessage,
      context: {
        step: 'executeMylistRegistration',
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      },
    });

    return {
      successVideoIds: [],
      failedVideoIds: videoIds,
      errorMessage,
    };
  } finally {
    // コンテキストとブラウザを閉じる
    if (context) {
      await context.close();
      console.log('ブラウザコンテキストを閉じました');
    }
    if (browser) {
      await browser.close();
      console.log('ブラウザを閉じました');
    }
  }
}
