import { test, expect } from '@playwright/test';

/**
 * SCR-MEM 記憶閲覧・削除画面（/memory）の基本フロー
 * （リブトーク知識再設計 P2 / #3698、SELF 一覧＋決定的削除への切替）。
 *
 * E2E では SKIP_AUTH_CHECK=true で認可をバイパスして画面描画を検証する。
 * DynamoDB のシードは行わないため、データ依存の削除は単体テスト側で担保し、
 * ここでは「画面が表示される」「ガイダンスが表示される」「ホームから導線がある」を検証する。
 */
test.describe('LiveTalk - 記憶閲覧・削除画面', () => {
  test('ホームのメニューに /memory への導線があり遷移できる', async ({ page }) => {
    await page.goto('/');
    // ナビゲーション導線は共通 Header のメニュー（モバイルはハンバーガー Drawer）へ移設された。
    // E2E 環境では DynamoDB が無く /api/consent が「未同意」と判定されるため、
    // 同意モーダルが常時表示され、Drawer を開く操作はインターセプトされる（実環境では同意後に消える）。
    // また Drawer は keepMounted のため閉じていても導線（href）は DOM 上に存在する。
    // ここでは可視性・aria-hidden に依存せず href の存在を検証し、遷移後の画面表示は直接遷移で確認する。
    const link = page.locator('a[href="/memory"]', { hasText: '私が覚えていること' });
    await expect(link.first()).toBeAttached();
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

  test('Tier タブが存在しない', async ({ page }) => {
    await page.goto('/memory');
    await expect(page.getByTestId('tier-tab-A')).toHaveCount(0);
    await expect(page.getByTestId('tier-tab-B')).toHaveCount(0);
    await expect(page.getByTestId('tier-tab-C')).toHaveCount(0);
  });

  test('一覧領域（一覧 or 空状態）が表示される', async ({ page }) => {
    await page.goto('/memory');
    await expect(
      page.getByTestId('memory-list').or(page.getByTestId('memory-empty'))
    ).toBeVisible();
  });
});
