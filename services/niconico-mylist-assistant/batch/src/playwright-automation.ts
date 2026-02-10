/**
 * Playwright を使用したニコニコ動画マイリスト自動化サービス
 */

import { chromium, Browser, Page } from 'playwright';
import { ERROR_MESSAGES, NICONICO_URLS, TIMEOUTS, VIDEO_REGISTRATION_WAIT } from './constants.js';
import { MylistRegistrationResult, LoginResult } from './types.js';
import { retry, sleep } from './utils.js';
import { createS3Client, uploadFile, getS3ObjectUrl } from '@nagiyu/aws';
import { readFile } from 'fs/promises';

/**
 * ニコニコ動画にログインする
 *
 * @param page Playwright Page オブジェクト
 * @param email ニコニコ動画のメールアドレス
 * @param password ニコニコ動画のパスワード
 * @returns ログイン結果（二段階認証が必要かどうか）
 */
export async function login(page: Page, email: string, password: string): Promise<LoginResult> {
  console.log('ニコニコ動画にログイン中...');

  try {
    // ログインページに移動
    await page.goto(NICONICO_URLS.LOGIN, {
      timeout: TIMEOUTS.NAVIGATION,
      waitUntil: 'domcontentloaded', // networkidle は広告等で時間がかかるため domcontentloaded に変更
    });

    // メールアドレス入力
    await page.fill('input[name="mail_tel"]', email);

    // パスワード入力
    await page.fill('input[name="password"]', password);

    // ログインボタンをクリック
    // アクセシビリティロールベースのセレクタを使用（より堅牢）
    await page.getByRole('button', { name: 'ログイン' }).click();

    // ログイン完了を待つ（URL遷移を確認）
    await page.waitForURL('**', { timeout: TIMEOUTS.LOGIN });

    // 二段階認証画面かどうかを確認
    // URLマッチで判断（https://account.nicovideo.jp/mfa で始まるURL）
    const currentUrl = page.url();
    const is2FAPage = currentUrl.includes('account.nicovideo.jp/mfa');

    if (is2FAPage) {
      console.log('二段階認証画面を検出しました（URLマッチ）');
      console.log('現在のURL:', currentUrl);
      return { requires2FA: true };
    }

    console.log('ログイン成功（二段階認証なし）');
    return { requires2FA: false };
  } catch (error) {
    console.error('ログイン失敗:', error);
    throw new Error(ERROR_MESSAGES.LOGIN_FAILED);
  }
}

/**
 * 二段階認証コードを入力する
 *
 * @param page Playwright Page オブジェクト
 * @param code 二段階認証コード（6桁）
 */
export async function inputTwoFactorAuthCode(page: Page, code: string): Promise<void> {
  console.log('二段階認証コードを入力中...');

  try {
    // 入力前のスクリーンショット
    await takeScreenshot(page, '2fa-before-input');

    // 入力欄を特定（id="oneTimePw" を使用）
    const inputField = page.locator('#oneTimePw');
    await inputField.fill(code);

    console.log('二段階認証コードを入力しました');

    // 入力後のスクリーンショット（入力内容確認用）
    await takeScreenshot(page, '2fa-after-input');

    // デバッグ情報: 入力欄の状態を確認
    try {
      const inputValue = await inputField.inputValue();
      console.log(`[DEBUG] 入力欄の値: ${inputValue}`);
      console.log(`[DEBUG] 入力欄の値の長さ: ${inputValue.length}`);
      console.log(`[DEBUG] 期待されるコード: ${code}`);
      console.log(`[DEBUG] 期待されるコードの長さ: ${code.length}`);
    } catch (debugError) {
      console.error('[DEBUG] 入力欄の値取得に失敗:', debugError);
    }

    // デバッグ情報: ページ上の全入力欄を出力
    try {
      const allInputs = await page.locator('input').all();
      console.log(`[DEBUG] ページ上の全入力欄数: ${allInputs.length}`);
      for (let i = 0; i < allInputs.length; i++) {
        const input = allInputs[i];
        const id = await input.getAttribute('id');
        const name = await input.getAttribute('name');
        const type = await input.getAttribute('type');
        const value = await input.inputValue().catch(() => '(取得不可)');
        console.log(
          `[DEBUG] 入力欄[${i}]: id="${id}", name="${name}", type="${type}", value="${value}"`
        );
      }
    } catch (debugError) {
      console.error('[DEBUG] 入力欄のデバッグ情報取得に失敗:', debugError);
    }

    // デバッグ情報: ページ上の全ボタンを出力
    try {
      const allButtons = await page.locator('button').all();
      console.log(`[DEBUG] ページ上の全ボタン数: ${allButtons.length}`);
      for (let i = 0; i < allButtons.length; i++) {
        const button = allButtons[i];
        const text = await button.textContent();
        const type = await button.getAttribute('type');
        const disabled = await button.isDisabled();
        const visible = await button.isVisible();
        console.log(
          `[DEBUG] ボタン[${i}]: text="${text}", type="${type}", disabled=${disabled}, visible=${visible}`
        );
      }
    } catch (debugError) {
      console.error('[DEBUG] ボタンのデバッグ情報取得に失敗:', debugError);
    }

    // ログインボタンをクリック
    const loginButton = page.getByRole('button', { name: 'ログイン' });
    console.log('[DEBUG] ログインボタンをクリックします...');

    // ナビゲーションを待機しながらクリック
    // 二段階認証ページ (account.nicovideo.jp/mfa) から離脱することを確認
    // domcontentloaded を待つ（全リソース読み込みを待たない）
    await Promise.all([
      page.waitForURL((url) => !url.toString().includes('account.nicovideo.jp/mfa'), {
        timeout: TIMEOUTS.LOGIN,
        waitUntil: 'domcontentloaded', // 全リソース読み込みを待たず、DOM構築完了で OK
      }),
      loginButton.click(),
    ]);

    console.log('[DEBUG] MFA ページから正常に離脱しました');

    // ボタンクリック後のスクリーンショット
    await takeScreenshot(page, '2fa-after-click');

    // デバッグ情報: ボタンクリック後のURL
    console.log(`[DEBUG] ボタンクリック後のURL: ${page.url()}`);

    console.log('二段階認証完了');
  } catch (error) {
    console.error('二段階認証コード入力失敗:', error);
    // エラー時の追加デバッグ情報
    console.error(`[DEBUG] エラー時のURL: ${page.url()}`);
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
      waitUntil: 'domcontentloaded', // networkidle は広告等で時間がかかるため domcontentloaded に変更
    });

    // ページの JavaScript が実行されてマイリストカウントが更新されるまで待機
    await sleep(2000);

    // シンプルなクラスベースのセレクタを使用（DOM構造変更に強い）
    const MYLIST_COUNT_SELECTOR = 'span.MylistPageSubMenuHeader-counterValueMylistCount';

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
        const countElement = page.locator(MYLIST_COUNT_SELECTOR).first();
        const countText = await countElement.textContent({ timeout: 30000 });

        if (!countText?.trim()) {
          console.error('マイリスト数を取得できませんでした。セレクタを確認してください。');
          // デバッグ用にセレクタ周辺のDOM構造を出力（個人情報を含まないように限定）
          try {
            const mylistContainer = await page.locator('.MylistSideContainer-categoryList').first();
            const containerHTML = await mylistContainer.innerHTML();
            console.log(
              'マイリストコンテナHTML（最初の500文字）:',
              containerHTML.substring(0, 500)
            );
          } catch (htmlError) {
            console.error('デバッグ用HTML取得失敗:', htmlError);
          }
          throw new Error('マイリスト数の取得に失敗しました');
        }

        console.log(`現在のマイリスト数: ${countText}`);

        if (countText === '0') {
          console.log('マイリスト数が0件になりました。削除処理を終了します。');
          break;
        }

        console.log(`マイリストを削除します（残り: ${countText}件）`);
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
        const firstMylistLink = page.locator('.MylistSideContainer-mylistList li:first-child a');
        await firstMylistLink.click({ timeout: 10000 });
        console.log('マイリスト詳細ページへ移動しました');
        await sleep(1000);

        // Step 2: マイリストヘッダーの3点メニューボタンをクリック
        const threePointMenuButton = page.locator('.NC-ThreePointMenu.MylistHeaderMenu button');
        await threePointMenuButton.click({ timeout: 10000 });
        console.log('3点メニューを開きました');
        await sleep(500);

        // Step 3: メニュー内の削除ボタンをクリック
        // メニューが開いた後、削除ボタンを探す（過去実績では3番目のボタン）
        // メニューは動的に表示されるので、.NC-ThreePointMenu-menu 内のボタンを探す
        const deleteButton = page.locator('.NC-ThreePointMenu-menu button').nth(2);
        await deleteButton.click({ timeout: 10000 });
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

    // マイリスト作成ボタンをクリック（実際のUIから確認したXPath）
    const createButton = page.locator(
      'xpath=//*[@id="UserPage-app"]/section/section/main/div/div/div[1]/div[2]/div/div/div/ul[1]/div/div/button[1]'
    );
    await createButton.click();

    await sleep(2000); // モーダル表示を待つ

    // マイリスト名を入力（実際のUIから確認したXPath）
    const nameInput = page.locator('xpath=//*[@id="undefined-title"]');
    await nameInput.fill(mylistName);

    // 作成ボタンをクリック（実際のUIから確認したXPath）
    const submitButton = page.locator('xpath=/html/body/div[13]/div/div/article/footer/button');
    await submitButton.click();

    await sleep(3000); // 作成処理の完了を待つ

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
    await page.screenshot({ path, fullPage: true });
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
 * @param onWaitFor2FA 二段階認証待ちコールバック（オプション）
 * @returns 登録結果
 */
export async function executeMylistRegistration(
  email: string,
  password: string,
  mylistName: string,
  videoIds: string[],
  onWaitFor2FA?: () => Promise<string>
): Promise<MylistRegistrationResult> {
  let browser: Browser | undefined;
  let page: Page | undefined;

  try {
    // ブラウザ起動
    browser = await launchBrowser();
    page = await browser.newPage();

    // ログイン
    const loginResult = await login(page, email, password);
    await takeScreenshot(page, 'after-login');

    // 二段階認証が必要な場合
    if (loginResult.requires2FA) {
      console.log('二段階認証が必要です');

      if (!onWaitFor2FA) {
        throw new Error(ERROR_MESSAGES.TWO_FACTOR_AUTH_REQUIRED);
      }

      // コールバックを呼び出して二段階認証コードを取得
      const code = await onWaitFor2FA();
      console.log('二段階認証コードを取得しました');

      // 二段階認証コードを入力
      await inputTwoFactorAuthCode(page, code);
      await takeScreenshot(page, 'after-2fa');
    }

    // 既存マイリストを削除
    await deleteAllMylists(page);
    await takeScreenshot(page, 'after-delete-mylists');

    // 新しいマイリストを作成
    await createMylist(page, mylistName);
    await takeScreenshot(page, 'after-create-mylist');

    // 動画を登録
    const result = await registerVideosToMylist(page, videoIds, mylistName);
    await takeScreenshot(page, 'after-register-videos');

    return {
      ...result,
      required2FA: loginResult.requires2FA,
    };
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
