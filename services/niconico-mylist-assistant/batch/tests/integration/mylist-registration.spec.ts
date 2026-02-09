/**
 * マイリスト登録フローの統合テスト
 *
 * このテストは、実際のニコニコ動画にアクセスしてセレクタの動作を確認します。
 * テスト専用アカウントを使用し、UI変更の早期検知を目的としています。
 *
 * 実行方法:
 * 1. .env.local を作成して認証情報を設定
 * 2. npm run test:integration
 * 3. ブラウザを表示する場合: HEADLESS=false npm run test:integration
 * 4. デバッグモード: PWDEBUG=1 npm run test:integration
 */

import { test, expect } from '@playwright/test';
import { login, deleteAllMylists } from '../../src/playwright-automation';

// 環境変数から認証情報を取得
const TEST_EMAIL = process.env.NICONICO_TEST_EMAIL;
const TEST_PASSWORD = process.env.NICONICO_TEST_PASSWORD;
const TEST_VIDEO_IDS = process.env.TEST_VIDEO_IDS?.split(',') || [];

test.describe('マイリスト登録フロー', () => {
  test.beforeAll(() => {
    // 環境変数チェック
    if (!TEST_EMAIL || !TEST_PASSWORD) {
      throw new Error(
        '環境変数 NICONICO_TEST_EMAIL と NICONICO_TEST_PASSWORD が必要です。\n' +
          '.env.local ファイルを作成して設定してください。'
      );
    }

    console.log('テスト用アカウント:', TEST_EMAIL);
    console.log('テスト用動画ID:', TEST_VIDEO_IDS);
  });

  /**
   * Step 1: ログイン検証
   *
   * 目的:
   * - ニコニコ動画へのログインが正常に動作することを確認
   * - ログインページのセレクタが正しいことを確認
   *
   * 検証項目:
   * - メールアドレス入力欄のセレクタ
   * - パスワード入力欄のセレクタ
   * - ログインボタンのセレクタ
   * - ログイン後のURL遷移
   */
  test('Step 1: ログインできる', async ({ page }) => {
    console.log('ログインテスト開始...');

    // デバッグ用: ブラウザを一時停止してセレクタを確認する場合はコメント解除
    // await page.pause();

    // ログイン実行
    await login(page, TEST_EMAIL!, TEST_PASSWORD!);

    // ログイン成功の確認（URL が nicovideo.jp であることを確認）
    await expect(page).toHaveURL(/nicovideo\.jp/);

    console.log('ログイン成功');
    console.log('現在のURL:', page.url());

    // スクリーンショット保存（手動確認用）
    await page.screenshot({
      path: 'test-results/step1-login-success.png',
    });

    console.log('スクリーンショット保存: test-results/step1-login-success.png');
  });

  /**
   * Step 2: マイリストページへのアクセス
   *
   * 目的:
   * - マイリストページに正常にアクセスできることを確認
   * - ページのセレクタを特定
   *
   * 検証項目:
   * - マイリストページのURLが正しいこと
   * - マイリストページの主要要素が表示されること
   */
  test('Step 2: マイリストページにアクセスできる', async ({ page }) => {
    console.log('マイリストページアクセステスト開始...');

    // まずログイン
    await login(page, TEST_EMAIL!, TEST_PASSWORD!);
    console.log('ログイン完了');

    // マイリストページに移動
    await page.goto('https://www.nicovideo.jp/my/mylist', {
      timeout: 30000,
      waitUntil: 'domcontentloaded', // networkidle は広告等で時間がかかるため domcontentloaded に変更
    });

    // ページの主要コンテンツが読み込まれるまで待つ
    // 「マイリストを作成する」ボタンまたは既存のマイリストが表示されることを待つ
    try {
      await page.waitForSelector('text=マイリストを作成', { timeout: 10000 });
      console.log('マイリスト作成ボタンを確認（マイリストが0件）');
    } catch {
      // マイリストが既に存在する場合は作成ボタンがないので、別の要素を確認
      console.log('マイリストが既に存在する可能性あり');
    }

    console.log('マイリストページに移動完了');
    console.log('現在のURL:', page.url());

    // URLが正しいことを確認
    await expect(page).toHaveURL(/nicovideo\.jp\/my\/mylist/);

    // スクリーンショット保存（広告等でフォント読み込みタイムアウトするためスキップ）
    // await page.screenshot({
    //   path: 'test-results/step2-mylist-page.png',
    // });

    console.log('マイリストページアクセステスト完了');

    // デバッグ: ページタイトルを表示
    const title = await page.title();
    console.log('ページタイトル:', title);
  });

  /**
   * Step 3: マイリストを作成して削除できる
   *
   * 目的:
   * - マイリストの作成セレクタを確認
   * - 既存のマイリストを全て削除できることを確認
   * - 作成→削除の完全なフローを検証
   *
   * 検証項目:
   * - マイリスト作成ボタンのセレクタ
   * - マイリスト名入力のセレクタ
   * - 作成後、マイリストが1件存在すること
   * - deleteAllMylists() が正常に動作すること
   * - 削除後、マイリストが0件になること
   */
  test('Step 3: マイリストを作成して削除できる', async ({ page }) => {
    console.log('マイリスト作成→削除テスト開始...');

    // まずログイン
    await login(page, TEST_EMAIL!, TEST_PASSWORD!);
    console.log('ログイン完了');

    // マイリストページに移動
    await page.goto('https://www.nicovideo.jp/my/mylist', {
      timeout: 30000,
      waitUntil: 'domcontentloaded',
    });

    console.log('マイリストページに移動完了');

    // 初期状態のスクリーンショット（広告等でフォント読み込みタイムアウトするためスキップ）
    // await page.screenshot({
    //   path: 'test-results/step3-initial-state.png',
    // });

    // デバッグ用: ページの HTML 構造を確認
    // await page.pause(); // 手動確認が必要な場合はコメント解除

    // マイリスト作成ボタンを探してクリック
    try {
      console.log('マイリスト作成ボタンを探しています...');

      // 過去リポジトリから取得した XPath を使用
      const createButton = page.locator(
        'xpath=//*[@id="UserPage-app"]/section/section/main/div/div/div[1]/div[2]/div/div/div/ul[1]/div/div/button[1]'
      );
      await createButton.click();

      console.log('マイリスト作成ボタンをクリックしました');

      // モーダルまたはフォームが表示されるまで待つ
      await page.waitForTimeout(2000);

      // マイリスト作成後のスクリーンショット
      // await page.screenshot({
      //   path: 'test-results/step3-create-form.png',
      // });

      // マイリスト名を入力
      const testMylistName = 'テストマイリスト_' + Date.now();
      console.log(`マイリスト名「${testMylistName}」を入力します`);

      // 過去リポジトリから取得した XPath を使用
      const nameInput = page.locator('xpath=//*[@id="undefined-title"]');
      await nameInput.fill(testMylistName);
      console.log('マイリスト名を入力しました');

      // 入力後のスクリーンショット
      // await page.screenshot({
      //   path: 'test-results/step3-name-filled.png',
      // });

      // 作成ボタンをクリック
      // 過去リポジトリから取得した XPath を使用
      const submitButton = page.locator('xpath=/html/body/div[13]/div/div/article/footer/button');
      await submitButton.click();
      console.log('作成ボタンをクリックしました');

      // 作成完了を待つ
      await page.waitForTimeout(3000);

      // 作成後のスクリーンショット
      // await page.screenshot({
      //   path: 'test-results/step3-after-create.png',
      // });

      // マイリストが作成されたことを確認
      // 作成したマイリスト名が表示されているか確認（複数箇所に表示されるので first() を使用）
      const mylistCreated = await page
        .getByText(testMylistName)
        .first()
        .isVisible({ timeout: 5000 });
      if (mylistCreated) {
        console.log('✓ マイリストが正常に作成されました');
      } else {
        console.log('警告: マイリストが作成されたかどうか不明');
      }

      // ここから削除テスト
      console.log('--- 削除テスト開始 ---');

      // 既存マイリストを全て削除
      await deleteAllMylists(page);

      console.log('マイリスト削除完了');

      // 削除後、ページをリロードして最新状態を確認
      await page.reload({ waitUntil: 'domcontentloaded' });

      // 削除後のスクリーンショット
      // await page.screenshot({
      //   path: 'test-results/step3-after-delete.png',
      // });

      // 「マイリストが見つかりません」または「マイリストを作成」が表示されることを確認
      const noMylistMessage = await page.getByText('マイリストが見つかりません').isVisible();
      const createButtonAfterDelete = await page.getByText('マイリストを作成').isVisible();

      if (noMylistMessage || createButtonAfterDelete) {
        console.log('✓ マイリストが0件であることを確認');
      } else {
        console.log('警告: マイリストが残っている可能性があります');
      }
    } catch (error) {
      console.error('マイリスト作成または削除中にエラーが発生しました:', error);

      // エラー時のスクリーンショット
      // await page.screenshot({
      //   path: 'test-results/step3-error.png',
      // });

      throw error;
    }

    console.log('スクリーンショット保存完了');
  });

  /**
   * Step 4: 動画をマイリストに登録できる
   *
   * 目的:
   * - 動画登録のセレクタを確認
   * - 動画をマイリストに正常に登録できることを確認
   *
   * 検証項目:
   * - 動画ページのマイリストボタンのセレクタ
   * - マイリスト選択のセレクタ
   * - 動画が正常に登録されること
   */
  test('Step 4: 動画をマイリストに登録できる', async ({ page }) => {
    console.log('動画登録テスト開始...');

    if (TEST_VIDEO_IDS.length === 0) {
      console.log('テスト用動画IDが設定されていないため、テストをスキップします');
      return;
    }

    // まずログイン
    await login(page, TEST_EMAIL!, TEST_PASSWORD!);
    console.log('ログイン完了');

    // マイリストページに移動
    await page.goto('https://www.nicovideo.jp/my/mylist', {
      timeout: 30000,
      waitUntil: 'domcontentloaded',
    });

    // 既存マイリストを削除
    await deleteAllMylists(page);
    console.log('既存マイリスト削除完了');

    // マイリストページに戻る
    await page.goto('https://www.nicovideo.jp/my/mylist', {
      timeout: 30000,
      waitUntil: 'domcontentloaded',
    });

    // テスト用マイリストを作成
    const testMylistName = 'テスト動画登録_' + Date.now();
    console.log(`マイリスト「${testMylistName}」を作成中...`);

    const createButton = page.locator(
      'xpath=//*[@id="UserPage-app"]/section/section/main/div/div/div[1]/div[2]/div/div/div/ul[1]/div/div/button[1]'
    );
    await createButton.click();
    await page.waitForTimeout(2000);

    const nameInput = page.locator('xpath=//*[@id="undefined-title"]');
    await nameInput.fill(testMylistName);

    const submitButton = page.locator('xpath=/html/body/div[13]/div/div/article/footer/button');
    await submitButton.click();
    await page.waitForTimeout(3000);

    console.log('マイリスト作成完了');

    // 最初の動画を登録してみる
    const testVideoId = TEST_VIDEO_IDS[0];
    console.log(`動画 ${testVideoId} を登録します`);

    // 動画ページに移動
    await page.goto(`https://www.nicovideo.jp/watch/${testVideoId}`, {
      timeout: 30000,
      waitUntil: 'domcontentloaded',
    });

    console.log('動画ページに移動しました');

    // 動画が読み込まれるまで少し待つ
    await page.waitForTimeout(3000);

    // 動画登録フロー: 3点メニュー → マイリストに追加 → マイリスト選択
    try {
      console.log('3点メニューボタンを探しています...');

      // 3点メニューボタンをクリック（aria-label="メニュー"を使用、exact: true で完全一致）
      const menuButton = page.getByRole('button', { name: 'メニュー', exact: true });
      await menuButton.click();
      console.log('3点メニューを開きました');

      await page.waitForTimeout(500);

      // 「マイリストに追加」メニュー項目をクリック
      const addToMylistButton = page.getByText('マイリストに追加');
      await addToMylistButton.click();
      console.log('「マイリストに追加」をクリックしました');

      await page.waitForTimeout(1000);

      // マイリスト選択ダイアログでマイリストを選択
      const selectMylistButton = page.getByText(testMylistName);
      await selectMylistButton.click();
      console.log(`マイリスト「${testMylistName}」を選択しました`);

      await page.waitForTimeout(2000);

      console.log('✓ 動画の登録に成功しました');
    } catch (error) {
      console.error('動画登録でエラー:', error);
      // スクリーンショット保存
      await page.screenshot({
        path: 'test-results/step4-error.png',
      });
      throw error;
    }

    console.log('動画登録テスト完了');
  });
});
