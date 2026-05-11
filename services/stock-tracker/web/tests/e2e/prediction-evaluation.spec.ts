import { test, expect } from '@playwright/test';

/**
 * 予測精度ダッシュボード PoC のスモーク E2E。
 *
 * PoC 段階ではモックデータ（`lib/prediction-evaluation/mock-data.ts`）が
 * クライアント側で組み立てられるため、API モックは不要。`SKIP_AUTH_CHECK=true`
 * の E2E 環境でテストユーザー（stock-admin）として表示できる前提。
 */

test.describe('予測精度ダッシュボード PoC', () => {
  test('ダッシュボードの主要セクションが表示される', async ({ page }) => {
    await page.goto('/prediction-evaluation');

    await expect(page.getByRole('heading', { name: '予測精度ダッシュボード' })).toBeVisible();
    await expect(page.getByText(/PoC 段階/)).toBeVisible();

    // 主要指標テキスト（見出し直下）
    await expect(page.getByTestId('summary-headline')).toContainText('方向精度');

    // 期間セレクター
    await expect(page.getByLabel('集計期間')).toBeVisible();

    // セクション見出し
    await expect(page.getByRole('heading', { name: '日次の方向精度推移' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'シグナル別の精度' })).toBeVisible();
  });

  test('期間を切り替えると主要指標テキストが更新される', async ({ page }) => {
    await page.goto('/prediction-evaluation');

    const headline = page.getByTestId('summary-headline');
    await expect(headline).toContainText('直近 30 日');
    const initialText = await headline.textContent();

    await page.getByLabel('集計期間').selectOption('7d');

    await expect(headline).toContainText('直近 7 日');
    await expect
      .poll(async () => await headline.textContent(), { timeout: 5000 })
      .not.toBe(initialText);
  });

  test('全期間（all）では「採点済みの予測がありません」と表示される', async ({ page }) => {
    await page.goto('/prediction-evaluation');

    await page.getByLabel('集計期間').selectOption('all');

    await expect(page.getByTestId('summary-headline')).toContainText('採点済みの予測がありません');
  });

  test('scenario=error クエリでエラーアラートが表示される', async ({ page }) => {
    await page.goto('/prediction-evaluation?scenario=error');

    await expect(page.getByText('予測精度サマリーの取得に失敗しました')).toBeVisible();
  });
});
