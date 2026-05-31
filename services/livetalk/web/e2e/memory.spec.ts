import { test, expect } from '@playwright/test';

/**
 * SCR-004 記憶閲覧・削除画面（/memory）の基本フロー。
 *
 * E2E では SKIP_AUTH_CHECK=true で認可をバイパスして画面描画を検証する。
 * DynamoDB のシードは行わないため、データ依存の削除は単体テスト側で担保し、
 * ここでは「画面が表示される」「Tier タブが切り替わる」「ガイダンスが表示される」
 * 「ホームから導線がある」を検証する。
 */
test.describe('LiveTalk - 記憶閲覧・削除画面', () => {
  test('ホームに /memory への導線があり遷移できる', async ({ page }) => {
    await page.goto('/');
    // E2E 環境では DynamoDB が無く /api/consent が「未同意」と判定されるため、
    // 同意モーダルが常時表示されリンククリックをインターセプトする（実環境では同意後に消える）。
    // ここでは導線（href）の存在を検証し、遷移後の画面表示は直接遷移で確認する。
    const link = page.getByRole('link', { name: '私が覚えていること' });
    await expect(link).toHaveAttribute('href', '/memory');
    await page.goto('/memory');
    await expect(page).toHaveURL(/\/memory$/);
    await expect(page.getByRole('heading', { name: '私が覚えていること' })).toBeVisible();
  });

  test('ページ冒頭に訂正方法のガイダンスが表示される', async ({ page }) => {
    await page.goto('/memory');
    await expect(page.getByText(/話しかけて訂正してね/)).toBeVisible();
  });

  test('編集ボタンが存在しない', async ({ page }) => {
    await page.goto('/memory');
    await expect(page.getByTestId('memory-edit')).toHaveCount(0);
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
