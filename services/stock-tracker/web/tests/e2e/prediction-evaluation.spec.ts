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

    // 期間セレクター
    await expect(page.getByLabel('集計期間')).toBeVisible();

    // KPI カード（5 種類）
    await expect(page.getByTestId('kpi-card-total-accuracy')).toBeVisible();
    await expect(page.getByTestId('kpi-card-directional-accuracy')).toBeVisible();
    await expect(page.getByTestId('kpi-card-neutral-ratio')).toBeVisible();
    await expect(page.getByTestId('kpi-card-judged-count')).toBeVisible();
    await expect(page.getByTestId('kpi-card-ai-failure-count')).toBeVisible();

    // セクション見出し
    await expect(page.getByRole('heading', { name: '日次の方向精度推移' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'シグナル別の精度' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '取引所別精度' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '銘柄別精度' })).toBeVisible();
  });

  test('期間を切り替えると別の集計が表示される', async ({ page }) => {
    await page.goto('/prediction-evaluation');

    const judgedCountValue = page.getByTestId('kpi-value-judged-count');
    await expect(judgedCountValue).toBeVisible();
    const initialCount = await judgedCountValue.textContent();

    await page.getByLabel('集計期間').selectOption('30d');

    await expect
      .poll(async () => await judgedCountValue.textContent(), { timeout: 5000 })
      .not.toBe(initialCount);
  });

  test('全期間（all）で空状態のメッセージが表示される', async ({ page }) => {
    await page.goto('/prediction-evaluation');

    await page.getByLabel('集計期間').selectOption('all');

    await expect(page.getByText('指定された期間に採点済みの予測がありません。')).toBeVisible();
  });

  test('scenario=error クエリでエラーアラートが表示される', async ({ page }) => {
    await page.goto('/prediction-evaluation?scenario=error');

    await expect(page.getByText('予測精度サマリーの取得に失敗しました')).toBeVisible();
  });
});
