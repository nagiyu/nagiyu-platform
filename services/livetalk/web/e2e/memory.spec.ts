import { test, expect } from '@playwright/test';

/**
 * SCR-004 記憶編集画面（/memory）の基本フロー。
 *
 * E2E では SKIP_AUTH_CHECK=true で認可をバイパスして画面描画を検証する。
 * DynamoDB のシードは行わないため、データ依存の編集・削除は単体テスト側で担保し、
 * ここでは「画面が表示される」「Tier タブが切り替わる」「ホームから導線がある」を検証する。
 */
test.describe('LiveTalk - 記憶編集画面', () => {
  test('ホームから /memory へ遷移できる', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: '私が覚えていること' }).click();
    await expect(page).toHaveURL(/\/memory$/);
    await expect(page.getByRole('heading', { name: '私が覚えていること' })).toBeVisible();
  });

  test('Tier タブが表示され切り替えできる', async ({ page }) => {
    await page.goto('/memory');

    await expect(page.getByTestId('tier-tab-A')).toBeVisible();
    await expect(page.getByTestId('tier-tab-B')).toBeVisible();
    await expect(page.getByTestId('tier-tab-C')).toBeVisible();

    // Tier D は UI に出さない
    await expect(page.getByTestId('tier-tab-D')).toHaveCount(0);

    await page.getByTestId('tier-tab-B').click();
    // 切替後もリスト領域（一覧 or 空状態 or ローディング）が存在する
    await expect(
      page.getByTestId('memory-list').or(page.getByTestId('memory-empty'))
    ).toBeVisible();
  });
});
