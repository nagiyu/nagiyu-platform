import { test, expect, type Page } from '@playwright/test';

test.describe('LiveTalk - Basic Functionality', () => {
  test('should load the homepage with chat UI', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/LiveTalk/);

    // 入力欄が表示されている（プレースホルダーから検索）
    await expect(page.getByPlaceholder('メッセージを入力')).toBeVisible();

    // VOICEVOX ライセンス表記が表示されている
    await expect(page.getByText(/VOICEVOX/)).toBeVisible();
  });

  test('should respond from health endpoint', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body.status).toBe('ok');
  });

  test('モバイル幅で主要要素が画面内に収まる', async ({ page }) => {
    // 旧実装は `if (isMobile) { expect(viewport.width).toBeLessThan(768) }` だった。
    // これは Playwright の config が設定した viewport を assert し直しているだけの
    // トートロジーで、desktop プロジェクトでは何も検証しなかった（1テスト=1結末に反する）。
    // ここでは viewport を明示的に固定し、入力欄が画面幅を超えないことを検証する。
    const mobileWidth = 375;
    await page.setViewportSize({ width: mobileWidth, height: 667 });
    await page.goto('/');

    const input = page.getByPlaceholder('メッセージを入力');
    await expect(input).toBeVisible();

    const box = await input.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(mobileWidth);
  });
});

/**
 * 縦の短いスマホで会話が見えることを確かめる。
 * 画面の高さをヘッダー・フッターの実寸から決めているため、実際のレイアウトでしか崩れを拾えない。
 */
const SHORT_MOBILE_VIEWPORTS = [
  { name: '375x667', width: 375, height: 667 },
  { name: '320x568', width: 320, height: 568 },
] as const;

/** チャット API の NDJSON 応答。音声なしの text イベントだけで返答を表示させる */
const MOCK_CHAT_RESPONSE =
  [
    { type: 'text', delta: 'こんにちは！今日はどんなことをお話ししようか。' },
    {
      type: 'text',
      delta: '寒くなってきたから、あったかい飲み物でも飲みながらゆっくり聞かせてね。',
    },
    { type: 'done' },
  ]
    .map((event) => JSON.stringify(event))
    .join('\n') + '\n';

const MOCK_REPLY_TAIL = 'ゆっくり聞かせてね。';

/** ホーム画面追加ガイドの後回しを記録する localStorage キー */
const INSTALL_SNOOZE_KEY = 'livetalk-install-snoozed-at';

/** 同意済み・チャット応答をモックした状態でチャット画面を開く */
async function openChat(page: Page, viewport: { width: number; height: number }) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  // 同意モーダルが送信を塞がないよう、同意済みとして扱う
  await page.route('**/api/consent', (route) => route.fulfill({ json: { consented: true } }));
  await page.route('**/api/chat', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/x-ndjson',
      body: MOCK_CHAT_RESPONSE,
    })
  );
  await page.goto('/');
  await expect(page.getByPlaceholder('メッセージを入力')).toBeVisible();
}

/** ページ全体が画面の高さからはみ出している量 (px)。0 以下なら収まっている */
async function pageOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
}

test.describe('LiveTalk - 縦の短いスマホでの会話表示', () => {
  for (const viewport of SHORT_MOBILE_VIEWPORTS) {
    test.describe(viewport.name, () => {
      test('会話の領域に高さがあり、ページが画面の高さを超えない', async ({ page }) => {
        // 初回訪問で出るホーム画面追加ガイドが最も縦を使うため、そのまま確かめる
        await openChat(page, viewport);

        // 実寸の測定は hydration 後に行うため、SSR の HTML が見えている間は待つ
        await expect.poll(() => pageOverflow(page)).toBeLessThanOrEqual(0);

        const box = await page.getByTestId('chat-scroll-area').boundingBox();
        expect(box).not.toBeNull();
        expect(box!.height).toBeGreaterThanOrEqual(100);
      });

      test('初回訪問でも、メッセージを送るとキャラの返答が画面内に見え、案内は閉じる', async ({
        page,
      }) => {
        await openChat(page, viewport);
        const installGuide = page.getByRole('button', { name: 'ホーム画面に追加する' });
        await expect(installGuide).toBeVisible();

        // 送信ボタンの click は開発サーバーのエラー表示が覆うことがあるため、Enter で送る
        await page.getByPlaceholder('メッセージを入力').fill('こんにちは');
        await page.getByPlaceholder('メッセージを入力').press('Enter');

        const reply = page.getByText(MOCK_REPLY_TAIL);
        await expect(reply).toBeVisible();

        // 自動スクロールの完了を待ってから、返答の末尾が会話の領域内かつ画面内にあることを確かめる
        const scrollArea = page.getByTestId('chat-scroll-area');
        await expect
          .poll(async () => {
            const replyBox = await reply.boundingBox();
            const areaBox = await scrollArea.boundingBox();
            if (!replyBox || !areaBox) return false;
            const replyBottom = replyBox.y + replyBox.height;
            return (
              replyBox.y >= areaBox.y - 1 &&
              replyBottom <= areaBox.y + areaBox.height + 1 &&
              replyBottom <= viewport.height
            );
          })
          .toBe(true);

        // 案内が会話の末尾に残ると返答が押し出されるため、返答が届いたら閉じる。
        // 閉じるのはその場の表示だけで、次回訪問で出せるよう後回しは記録しない
        await expect(installGuide).toBeHidden();
        const snoozed = await page.evaluate(
          (key) => window.localStorage.getItem(key),
          INSTALL_SNOOZE_KEY
        );
        expect(snoozed).toBeNull();

        await expect.poll(() => pageOverflow(page)).toBeLessThanOrEqual(0);
      });
    });
  }
});
