import { expect, test, type Locator, type Page } from '@playwright/test';
import { stubThumbnails } from './helpers/test-data';

/**
 * インポート画面と動画検索モーダルが、狭い画面と長いタイトルでも崩れないことを検証する。
 *
 * 検索 API と一括インポート API は `page.route` で固定する。Service Worker が API 応答を
 * 仲介すると webkit では `page.route` が捕捉できないため、spec 側で一律にブロックする。
 */
test.use({ serviceWorkers: 'block' });

const MOBILE = { width: 390, height: 844 } as const;
const DESKTOP = { width: 1280, height: 900 } as const;

// 空白が無く折り返しの手がかりが無い長いタイトル（日本語は文字間で折り返せるため英数字にする）
const LONG_TITLE = 'LongVideoTitleWithoutAnySpaces'.repeat(4);

async function mockSearchAndImport(page: Page): Promise<void> {
  await stubThumbnails(page);
  await page.route(/\/api\/videos\/search/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        videos: [
          {
            videoId: 'sm9999',
            title: LONG_TITLE,
            description: 'desc',
            thumbnailUrl: 'https://example.com/thumb.jpg',
            duration: 120,
            viewCount: 1,
            commentCount: 1,
            mylistCount: 1,
            uploadedAt: '2024-01-01T00:00:00+09:00',
            tags: [],
            isRegistered: false,
          },
        ],
        total: 1,
      }),
    });
  });
  await page.route('**/api/videos/bulk-import', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ imported: 1, skipped: 0, failed: 0 }),
    });
  });
}

async function openSearchResults(page: Page): Promise<Locator> {
  await page.goto('/import');
  await page.getByRole('button', { name: '動画を検索して追加' }).click();
  await page.getByLabel('検索キーワード').fill('長いタイトル');
  await page.getByLabel('検索キーワード').press('Enter');

  const dialog = page.getByRole('dialog', { name: '動画検索' });
  await expect(dialog.getByText(LONG_TITLE)).toBeVisible();
  return dialog;
}

/** inner が outer の内側（横方向）に収まっていること */
async function expectInside(inner: Locator, outer: { x: number; width: number }): Promise<void> {
  const rect = await inner.boundingBox();
  expect(rect).not.toBeNull();
  expect(rect!.x).toBeGreaterThanOrEqual(outer.x);
  expect(rect!.x + rect!.width).toBeLessThanOrEqual(outer.x + outer.width);
}

test.describe('インポート画面のレイアウト', () => {
  test('390px 幅でも 2 つのボタンが画面内に収まる', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto('/import');

    const searchButton = page.getByRole('button', { name: '動画を検索して追加' });
    const importButton = page.getByRole('button', { name: 'インポート実行' });
    await expect(searchButton).toBeVisible();
    await expect(importButton).toBeVisible();

    await expectInside(searchButton, { x: 0, width: MOBILE.width });
    await expectInside(importButton, { x: 0, width: MOBILE.width });

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(MOBILE.width);
  });
});

test.describe('動画検索モーダルのレイアウト', () => {
  test('390px 幅で長いタイトルでもボタンがカード内に収まり、2 段目に回る', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await mockSearchAndImport(page);
    const dialog = await openSearchResults(page);

    const card = dialog.locator('.MuiCard-root').first();
    const cardRect = await card.boundingBox();
    expect(cardRect).not.toBeNull();
    await expectInside(card, { x: 0, width: MOBILE.width });

    const addButton = dialog.getByRole('button', { name: '追加', exact: true });
    await expectInside(addButton, cardRect!);
    await expectInside(dialog.getByText(LONG_TITLE), cardRect!);

    // 狭い画面ではタイトルの下にボタンが全幅で並ぶ
    const titleRect = await dialog.getByText(LONG_TITLE).boundingBox();
    const buttonRect = await addButton.boundingBox();
    expect(buttonRect!.y).toBeGreaterThanOrEqual(titleRect!.y + titleRect!.height);
    expect(buttonRect!.width).toBeGreaterThan(cardRect!.width / 2);

    // 追加後にボタンの文言が変わっても収まる
    await addButton.click();
    const addedButton = dialog.getByRole('button', { name: '追加済み', exact: true });
    await expect(addedButton).toBeVisible();
    await expectInside(addedButton, cardRect!);
  });

  test('1280px 幅ではタイトルの右にボタンが並び、カード内に収まる', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await mockSearchAndImport(page);
    const dialog = await openSearchResults(page);

    const card = dialog.locator('.MuiCard-root').first();
    const cardRect = await card.boundingBox();
    expect(cardRect).not.toBeNull();

    const addButton = dialog.getByRole('button', { name: '追加', exact: true });
    await expectInside(addButton, cardRect!);
    await expectInside(dialog.getByText(LONG_TITLE), cardRect!);

    // 広い画面ではタイトルとボタンが同じ段に並び、重ならない
    const titleRect = await dialog.getByText(LONG_TITLE).boundingBox();
    const buttonRect = await addButton.boundingBox();
    expect(buttonRect!.x).toBeGreaterThanOrEqual(titleRect!.x + titleRect!.width);
    expect(buttonRect!.y).toBeLessThan(titleRect!.y + titleRect!.height);
  });
});
