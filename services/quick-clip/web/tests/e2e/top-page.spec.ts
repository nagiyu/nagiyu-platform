import { test, expect } from '@playwright/test';
import path from 'path';
import type { Page } from '@playwright/test';

test.describe('QuickClip Top Page', () => {
  test('トップページの基本要素を表示する', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1, name: 'さくっとクリップ' })).toBeVisible();
    await expect(page.getByText('動画をアップロードして見どころ抽出を開始します。')).toBeVisible();
    await expect(page.getByRole('button', { name: 'アップロードして処理開始' })).toBeDisabled();
  });

  test('動画アップロード後に処理中画面へ遷移する', async ({ page }) => {
    await page.goto('/');
    await page.route('**/api/jobs', async (route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          jobId: 'e2e-job-id',
          status: 'PENDING',
          uploadUrl: 'https://example.com/upload',
          expiresIn: 3600,
        }),
      });
    });
    await page.route('https://example.com/upload', async (route) => {
      await route.fulfill({
        status: 200,
        body: '',
      });
    });

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(__dirname, '../fixtures/sample.mp4'));

    await Promise.all([
      page.waitForURL(/\/jobs\//),
      page.getByRole('button', { name: 'アップロードして処理開始' }).click(),
    ]);

    await expect(page.getByRole('heading', { level: 1, name: '処理状況' })).toBeVisible();
  });

  test('アップロード中にページを閉じようとすると離脱確認が出る', async ({ page }) => {
    await page.goto('/');
    let releaseJobResponse: () => void = () => {};
    const jobResponseGate = new Promise<void>((resolve) => {
      releaseJobResponse = resolve;
    });
    await page.route('**/api/jobs', async (route) => {
      await jobResponseGate;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          jobId: 'e2e-job-id',
          status: 'PENDING',
          uploadUrl: 'https://example.com/upload',
          expiresIn: 3600,
        }),
      });
    });

    await page
      .locator('input[type="file"]')
      .setInputFiles(path.join(__dirname, '../fixtures/sample.mp4'));
    await page.getByRole('button', { name: 'アップロードして処理開始' }).click();
    // 送信状態に入ったことを待ってから閉じる。入る前だと警告が未登録で判定が揺れる
    await expect(page.getByText(/アップロード中\.\.\./).first()).toBeVisible();

    const dialogPromise = page.waitForEvent('dialog');
    await page.close({ runBeforeUnload: true });
    const dialog = await dialogPromise;
    expect(dialog.type()).toBe('beforeunload');
    await dialog.dismiss();
    releaseJobResponse();
  });

  test('送信前はページを閉じても離脱確認が出ない', async ({ page }) => {
    await page.goto('/');
    await page
      .locator('input[type="file"]')
      .setInputFiles(path.join(__dirname, '../fixtures/sample.mp4'));

    let dialogShown = false;
    page.on('dialog', () => {
      dialogShown = true;
    });
    await page.close({ runBeforeUnload: true });

    expect(dialogShown).toBe(false);
  });
});

const SAMPLE_VIDEO = path.join(__dirname, '../fixtures/sample.mp4');

const usageBody = (
  overrides: {
    tier?: string;
    remaining?: { ai: number; noAi: number };
    maxDurationSec?: number;
  } = {}
) => ({
  month: '2026-11',
  tier: overrides.tier ?? 'free',
  limits: { aiPerMonth: 1, noAiPerMonth: 10, maxDurationSec: overrides.maxDurationSec ?? 10800 },
  used: { ai: 0, noAi: 0 },
  remaining: overrides.remaining ?? { ai: 1, noAi: 10 },
});

const mockUsage = async (page: Page, body: object) => {
  await page.route('**/api/usage', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
};

test.describe('QuickClip 利用回数の制限', () => {
  test('残り回数と AI 解析のスイッチを表示する', async ({ page }) => {
    await mockUsage(page, usageBody());
    await page.goto('/');

    await expect(page.getByText('今月の残り: AI 解析あり 1 回 / なし 10 回')).toBeVisible();
    await expect(
      page.getByRole('switch', { name: 'AI 解析 (文字起こし・感情分析) を使う' })
    ).toBeChecked();
  });

  test('上限なしの段は残りを無制限と表示し、AI 解析を選べる', async ({ page }) => {
    await mockUsage(page, {
      month: '2026-11',
      tier: 'unlimited',
      limits: { aiPerMonth: null, noAiPerMonth: null, maxDurationSec: 14400 },
      used: { ai: 0, noAi: 0 },
      remaining: { ai: null, noAi: null },
    });
    await page.goto('/');

    await expect(page.getByText('今月の残り: 無制限')).toBeVisible();
    await expect(
      page.getByRole('switch', { name: 'AI 解析 (文字起こし・感情分析) を使う' })
    ).toBeEnabled();
  });

  test('スイッチの選択をジョブ作成に渡す', async ({ page }) => {
    await mockUsage(page, usageBody());
    let requestBody: Record<string, unknown> = {};
    await page.route('**/api/jobs', async (route) => {
      requestBody = route.request().postDataJSON();
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ jobId: 'e2e-job-id', uploadUrl: 'https://example.com/upload' }),
      });
    });
    await page.route('https://example.com/upload', (route) =>
      route.fulfill({ status: 200, body: '' })
    );
    await page.goto('/');

    await page.getByRole('switch', { name: /AI 解析/ }).uncheck();
    await page.locator('input[type="file"]').setInputFiles(SAMPLE_VIDEO);
    await Promise.all([
      page.waitForURL(/\/jobs\//),
      page.getByRole('button', { name: 'アップロードして処理開始' }).click(),
    ]);

    expect(requestBody.aiAnalysis).toBe(false);
  });

  test('未ログインで AI の残りが 0 ならスイッチを選べず、ログインを案内する', async ({ page }) => {
    await mockUsage(page, usageBody({ tier: 'anonymous', remaining: { ai: 0, noAi: 3 } }));
    await page.goto('/');

    await expect(page.getByText('ログインすると AI 解析を月 1 回お試しできます')).toBeVisible();
    const toggle = page.getByRole('switch', { name: /AI 解析/ });
    await expect(toggle).toBeDisabled();
    await expect(toggle).not.toBeChecked();
    await expect(page.getByRole('link', { name: 'ログインする' })).toHaveAttribute(
      'href',
      /\/signin\?callbackUrl=/
    );
  });

  test('ログイン済みで AI の残りが 0 なら、使い切りとプランの画面を案内する', async ({ page }) => {
    await mockUsage(page, usageBody({ remaining: { ai: 0, noAi: 5 } }));
    await page.goto('/');

    await expect(page.getByText('今月の AI 解析の回数を使い切りました')).toBeVisible();
    await expect(page.getByRole('switch', { name: /AI 解析/ })).toBeDisabled();
    await expect(page.getByRole('link', { name: 'プランを見る' })).toHaveAttribute(
      'href',
      /\/plans\?callbackUrl=/
    );
  });

  test('/api/usage が失敗しても残りとスイッチを出さずにアップロードできる', async ({ page }) => {
    await page.route('**/api/usage', (route) => route.fulfill({ status: 500, body: '{}' }));
    await page.goto('/');
    await page.locator('input[type="file"]').setInputFiles(SAMPLE_VIDEO);

    await expect(page.getByRole('switch')).toHaveCount(0);
    await expect(page.getByText(/今月の残り/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'アップロードして処理開始' })).toBeEnabled();
  });

  test('上限のエラーが返ったら message とプランの画面への案内を出す', async ({ page }) => {
    await mockUsage(page, usageBody());
    await page.route('**/api/jobs', async (route) => {
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'NO_AI_LIMIT_EXCEEDED',
          message: '今月の AI 解析なしの回数を使い切りました',
        }),
      });
    });
    await page.goto('/');
    await page.locator('input[type="file"]').setInputFiles(SAMPLE_VIDEO);
    await page.getByRole('button', { name: 'アップロードして処理開始' }).click();

    await expect(page.getByText('今月の AI 解析なしの回数を使い切りました')).toBeVisible();
    await expect(page.getByRole('link', { name: 'プランを見る' })).toBeVisible();
  });

  test('動画の長さが上限を超えていたら、アップロード前に警告して送信させない', async ({ page }) => {
    // 固定のフィクスチャは動画として読めないため、ブラウザが返す長さを差し替える
    await page.addInitScript(() => {
      Object.defineProperty(HTMLMediaElement.prototype, 'duration', { get: () => 190 * 60 });
      Object.defineProperty(HTMLMediaElement.prototype, 'src', {
        set(this: HTMLMediaElement) {
          setTimeout(() => this.dispatchEvent(new Event('loadedmetadata')), 0);
        },
        get: () => '',
      });
    });
    await mockUsage(page, usageBody());
    await page.goto('/');
    await page.locator('input[type="file"]').setInputFiles(SAMPLE_VIDEO);

    await expect(
      page.getByText('この動画は 190 分で、ご利用の上限 (180 分) を超えています')
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'アップロードして処理開始' })).toBeDisabled();
    await expect(page.getByRole('link', { name: 'プランを見る' })).toBeVisible();
  });
});
