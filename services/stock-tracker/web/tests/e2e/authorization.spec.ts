import { test, expect } from './fixtures';

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

/**
 * E2E-005: 権限チェック
 *
 * ロールごとに `test.describe` を分け、`test.use({ role: [...] })` でロールを固定した
 * 上で 1 テスト = 1 結末（deny/allow のどちらか一方）を検証する。
 * 旧実装にあった「isVisible ? A : B」「status === 201 ? ... : ...」のような
 * 条件分岐（両結末を1テストが飲み込む形骸化）は行わない。
 */

test.describe('権限チェック (E2E-005)', () => {
  test.describe('stock-admin ロール: マスタデータ管理APIを実行できる', () => {
    test.use({ role: ['stock-admin'] });

    test('取引所作成APIは201で成功する', async ({ request }) => {
      const exchangeId = `TEST-E2E-AUTH-ADMIN-${Date.now()}`;

      const response = await request.post('/api/exchanges', {
        data: {
          exchangeId,
          name: 'Test Exchange for Auth (admin)',
          key: 'TEST',
          timezone: 'America/New_York',
          tradingHours: {
            start: '09:30',
            end: '16:00',
          },
        },
      });

      expect(response.status()).toBe(201);

      // 後始末
      await request.delete(`/api/exchanges/${exchangeId}`);
    });
  });

  test.describe('stock-viewer ロール: マスタデータ管理APIは拒否される', () => {
    test.use({ role: ['stock-viewer'] });

    test('取引所作成APIは403で拒否される', async ({ request }) => {
      const exchangeId = `TEST-E2E-AUTH-VIEWER-${Date.now()}`;

      const response = await request.post('/api/exchanges', {
        data: {
          exchangeId,
          name: 'Test Exchange for Auth (viewer)',
          key: 'TEST',
          timezone: 'America/New_York',
          tradingHours: {
            start: '09:30',
            end: '16:00',
          },
        },
      });

      expect(response.status()).toBe(403);
    });

    test('ティッカー作成APIは403で拒否される', async ({ request }) => {
      const response = await request.post('/api/tickers', {
        data: {
          symbol: 'TEST',
          name: 'Test Ticker for Auth (viewer)',
          exchangeId: 'NASDAQ',
        },
      });

      expect(response.status()).toBe(403);
    });
  });

  test.describe('read 権限: ロール非依存で許可される', () => {
    // 既定ロール（stock-admin）で検証する。read は全ロール共通で許可されるため、
    // いずれのロールで検証しても結論は変わらない。
    test('取引所一覧取得APIは200で成功する', async ({ request }) => {
      const response = await request.get('/api/exchanges');

      expect(response.status()).toBe(200);
    });
  });
});
