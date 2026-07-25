import { test, expect } from '@playwright/test';

/**
 * webkit-mobile 対応: 実 Service Worker（/sw.js）を無効化する。
 *
 * 本アプリは libs/ui の ServiceWorkerRegistration が全ページで /sw.js を登録するため、
 * webkit では SW がページを制御し、API 応答を仲介・キャッシュしてしまう。Playwright は
 * 「Service Worker 経由のリクエストは Chromium 以外では page.route で捕捉できない」
 * という既知の制約があるため、モックが素通りしたり、UI が古い応答を表示したりして
 * テストが非決定的になる（実測で確認済み）。
 *
 * `chromium-mobile` プロジェクトは playwright.config.base.ts 側で
 * `serviceWorkers: 'block'` を設定済みだが、`chromium-desktop` / `webkit-mobile` は
 * 未設定という非対称があるため、本サービスの spec 側で一律に打ち消す。
 * （設定の非対称そのものの解消は E2E 横断整備の範囲と判断し、本対応では触れない。）
 */
test.use({ serviceWorkers: 'block' });

test.describe('Health Check', () => {
  test('should return ok status', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.status).toBe('ok');
    expect(data).toHaveProperty('timestamp');
    expect(data).toHaveProperty('version');
  });
});
