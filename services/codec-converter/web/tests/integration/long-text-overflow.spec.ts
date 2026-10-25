/**
 * Codec Converter - E2E Test: 長いファイル名の表示
 *
 * 狭い画面で、空白を含まない長いファイル名がページを横に広げたり、
 * 親の要素の右端を越えたりしないことを確認する。
 * ジョブ詳細は `/api/jobs/:id` をモックするため、AWS 環境を必要としない。
 */

import { test, expect } from './helpers';
import type { Locator } from '@playwright/test';

const MOBILE_WIDTH = 390;
const LONG_FILE_NAME = `${'長いファイル名'.repeat(6)}${'abcdefghij'.repeat(8)}.mp4`;
const JOB_ID = '12345678-1234-1234-1234-123456789012';

/** 要素内のテキストが画面上で占める行数を数える（途中で割れているかを判定するため） */
async function countTextLines(locator: Locator): Promise<number> {
  return locator.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const tops = new Set(Array.from(range.getClientRects()).map((rect) => Math.round(rect.top)));
    return tops.size;
  });
}

async function getRight(locator: Locator): Promise<number> {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error('要素の位置を取得できませんでした');
  }
  return box.x + box.width;
}

test.describe('長いファイル名の表示 (モバイル幅)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: MOBILE_WIDTH, height: 844 });
  });

  test('選択したファイル名がページを広げず、囲みの右端を越えない', async ({ page }) => {
    await page.goto('/');

    await page.locator('input[type="file"]').setInputFiles({
      name: LONG_FILE_NAME,
      mimeType: 'video/mp4',
      buffer: Buffer.alloc(1024),
    });

    const fileName = page.getByText(LONG_FILE_NAME);
    await expect(fileName).toBeVisible();

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(MOBILE_WIDTH);

    // 折り返されずに囲みから突き出していないこと
    const container = fileName.locator('xpath=..');
    expect(await getRight(fileName)).toBeLessThanOrEqual((await getRight(container)) + 1);
    expect(await countTextLines(fileName)).toBeGreaterThan(1);
  });

  test('ジョブ詳細のファイル名がページを広げず、ラベルが途中で割れない', async ({ page }) => {
    const now = Date.now();
    await page.route(`**/api/jobs/${JOB_ID}`, (route) =>
      route.fulfill({
        json: {
          jobId: JOB_ID,
          status: 'COMPLETED',
          inputFile: 'uploads/input.mp4',
          outputFile: 'outputs/output.mp4',
          outputCodec: 'h264',
          fileName: LONG_FILE_NAME,
          fileSize: 1024,
          createdAt: now,
          updatedAt: now,
          expiresAt: now + 24 * 60 * 60 * 1000,
          downloadUrl: 'https://example.com/download',
        },
      })
    );

    await page.goto(`/jobs/${JOB_ID}`);

    const fileName = page.getByText(LONG_FILE_NAME);
    await expect(fileName).toBeVisible();

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(MOBILE_WIDTH);

    // 値は親の行の右端を越えない。折り返されていること
    const row = fileName.locator('xpath=..');
    expect(await getRight(fileName)).toBeLessThanOrEqual((await getRight(row)) + 1);
    expect(await countTextLines(fileName)).toBeGreaterThan(1);

    // 和文のラベルは途中に改行位置があるため、値が長いと「ファイル / 名:」で先に割れる
    for (const label of ['ジョブID:', 'ファイル名:', 'ファイルサイズ:', '出力コーデック:']) {
      expect(await countTextLines(page.getByText(label, { exact: true }))).toBe(1);
    }
  });
});
