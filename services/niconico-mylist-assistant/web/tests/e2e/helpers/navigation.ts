import { expect, type Page } from '@playwright/test';

const MOBILE_BREAKPOINT_PX = 900;

function isMobileViewport(page: Page): boolean {
  const viewport = page.viewportSize();
  return viewport ? viewport.width < MOBILE_BREAKPOINT_PX : false;
}

async function ensureMobileDrawerOpen(page: Page) {
  const drawer = page.getByRole('navigation', { name: 'ナビゲーションメニュー' });
  if (!(await drawer.isVisible())) {
    await page.getByRole('button', { name: 'メニューを開く' }).click();
    await expect(drawer).toBeVisible();
  }
}

export async function expectNavigationItemVisible(page: Page, label: string) {
  if (isMobileViewport(page)) {
    await ensureMobileDrawerOpen(page);
    const drawer = page.getByRole('navigation', { name: 'ナビゲーションメニュー' });
    await expect(drawer.getByText(label, { exact: true })).toBeVisible();
  } else {
    // Header の NavigationMenuItem は MUI Button + href={...} で描画され、
    // 実体は <a> 要素のため accessibility role は "link"。
    // exact: true を付けないと、ロゴリンクの aria-label
    // "Niconico Mylist Assistant ホームページに戻る" 等への部分一致で
    // strict mode violation になるため必須。
    const toolbar = page.locator('header[class*="MuiAppBar"] [class*="MuiToolbar"]');
    await expect(toolbar.getByRole('link', { name: label, exact: true })).toBeVisible();
  }
}

export async function clickNavigationItem(page: Page, label: string) {
  if (isMobileViewport(page)) {
    await ensureMobileDrawerOpen(page);
    const drawer = page.getByRole('navigation', { name: 'ナビゲーションメニュー' });
    await drawer.getByText(label, { exact: true }).click();
  } else {
    const toolbar = page.locator('header[class*="MuiAppBar"] [class*="MuiToolbar"]');
    await toolbar.getByRole('link', { name: label, exact: true }).click();
  }
}
