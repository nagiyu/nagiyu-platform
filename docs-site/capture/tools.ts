import type { Page } from '@playwright/test';
import type { Scenario, ScenarioContext, ServiceCapture } from './types';
import {
  FAKE_VAPID_KEYS,
  JSON_COMPACT,
  JSON_INVALID,
  MIGRATION_DIALOG_STORAGE_KEY,
  NOT_ENCODED_TEXT,
  NOT_TRANSIT_TEXT,
  SAMPLE_TEXT,
  TRANSIT_TEXT,
} from './tools-data';

/**
 * tools の撮影シナリオ。画面ごとに、カードで紹介する状態を撮る。
 * 状態を足したら、カードの「画面の見た目」にも同じ名前で足す。
 *
 * このサービスは認証もデータベースも持たず、変換はブラウザの中で終わる。
 * 外部への通信は VAPID キーの生成 API だけで、撮影では応答を差し替えて固定する。
 * 初回訪問ダイアログは、どの画面にも重なるため、ダイアログを撮る状態以外では出ないようにしておく。
 */

/** 描画が落ち着くまで待つ。待つ対象のテキストを明示する */
async function ready(page: Page, text: string): Promise<void> {
  await page.getByText(text, { exact: false }).first().waitFor();
  // 入力欄は、hydration が終わる前に fill しても React の state に届かない
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
}

interface VisitOptions {
  /** true なら初回訪問ダイアログを抑止せず、そのまま出す */
  showDialog?: boolean;
}

/** 新しいページで `path` を開く。初回訪問ダイアログは既定で出さない (E2E と同じく localStorage のフラグで抑止する) */
async function visit(
  ctx: ScenarioContext,
  path: string,
  waitFor: string,
  options: VisitOptions = {}
): Promise<Page> {
  const page = await ctx.freshPage();
  if (!options.showDialog) {
    await page.addInitScript((key: string) => {
      window.localStorage.setItem(key, 'true');
    }, MIGRATION_DIALOG_STORAGE_KEY);
  }
  await page.goto(path);
  await ready(page, waitFor);
  return page;
}

/** クリップボードの読み書きを許可する。E2E と同じ設定 */
async function grantClipboard(page: Page): Promise<void> {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
}

/** クリップボードの読み書きが必ず失敗するようにする (非対応のブラウザや、許可を拒否した状態) */
async function breakClipboard(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        // 許可の確認を待ってから拒否される実際の挙動に合わせ、少し遅れて失敗させる。
        // すぐに失敗させると、押したボタンへのクリックが通知バーの外側のクリックとして届き、通知が閉じてしまう
        readText: () =>
          new Promise((_, reject) => setTimeout(() => reject(new Error('denied')), 500)),
        writeText: () =>
          new Promise((_, reject) => setTimeout(() => reject(new Error('denied')), 500)),
      },
      configurable: true,
    });
  });
}

const home: Scenario = {
  screen: 'home',
  async run(ctx) {
    // 通常表示 (7 つのツールのカード)
    await visit(ctx, '/', 'Tools - 便利なツール集');
    await ctx.shot('default');

    // 初回訪問 (旧バージョンからの移行を案内するダイアログが前面に出る)
    const page = await visit(ctx, '/', 'Tools - 便利なツール集', { showDialog: true });
    await page.getByRole('dialog', { name: 'Toolsアプリが新しくなりました' }).waitFor();
    await ctx.shot('migration-dialog', { viewportOnly: true });
  },
};

const offline: Scenario = {
  screen: 'offline',
  async run(ctx) {
    await visit(ctx, '/offline', 'オフラインです');
    await ctx.shot('default');
  },
};

/** エンコード / デコードの 2 モードを持つツール (Base64・URL) の共通の撮影 */
function encoderScenario(options: {
  screen: string;
  path: string;
  heading: string;
  encodePlaceholder: string;
  decodePlaceholder: string;
  encodeLabel: string;
  decodeLabel: string;
  encodedMessage: string;
  decodeFailedMessage: string;
  withCopied: boolean;
}): Scenario {
  return {
    screen: options.screen,
    async run(ctx) {
      // 通常表示 (エンコードモード。「エンコード」は押せない)
      await visit(ctx, options.path, options.heading);
      await ctx.shot('default');

      // エンコードした
      let page = await visit(ctx, options.path, options.heading);
      await page.getByPlaceholder(options.encodePlaceholder).fill(SAMPLE_TEXT);
      await page.getByRole('button', { name: options.encodeLabel }).click();
      await page.getByText(options.encodedMessage).waitFor();
      await ctx.shot('encoded');

      // デコードモードで、変換できない文字列を入れた
      page = await visit(ctx, options.path, options.heading);
      await page.getByRole('button', { name: 'デコードモードに切り替える' }).click();
      await page.getByPlaceholder(options.decodePlaceholder).fill(NOT_ENCODED_TEXT);
      await page.getByRole('button', { name: options.decodeLabel }).click();
      await page.getByText(options.decodeFailedMessage).first().waitFor();
      await ctx.shot('decode-error');

      if (options.withCopied) {
        // 結果をコピーした
        page = await visit(ctx, options.path, options.heading);
        await grantClipboard(page);
        await page.getByPlaceholder(options.encodePlaceholder).fill(SAMPLE_TEXT);
        await page.getByRole('button', { name: options.encodeLabel }).click();
        await page.getByText(options.encodedMessage).waitFor();
        await page.getByRole('button', { name: '結果をクリップボードにコピーする' }).click();
        await page.getByText('クリップボードにコピーしました').waitFor();
        await ctx.shot('copied');

        // コピーに失敗した (クリップボードを使えない)
        page = await ctx.freshPage();
        await breakClipboard(page);
        await page.addInitScript((key: string) => {
          window.localStorage.setItem(key, 'true');
        }, MIGRATION_DIALOG_STORAGE_KEY);
        await page.goto(options.path);
        await ready(page, options.heading);
        await page.getByPlaceholder(options.encodePlaceholder).fill(SAMPLE_TEXT);
        await page.getByRole('button', { name: options.encodeLabel }).click();
        await page.getByText(options.encodedMessage).waitFor();
        await page.getByRole('button', { name: '結果をクリップボードにコピーする' }).click();
        await page.getByText('コピーに失敗しました').waitFor();
        await ctx.shot('copy-failed');
      }
    },
  };
}

const base64 = encoderScenario({
  screen: 'base64',
  path: '/base64',
  heading: 'Base64 エンコーダー / デコーダー',
  encodePlaceholder: 'エンコードする文字列を入力してください...',
  decodePlaceholder: 'デコードするBase64文字列を入力してください...',
  encodeLabel: '入力をBase64にエンコードする',
  decodeLabel: '入力をBase64からデコードする',
  encodedMessage: 'Base64にエンコードしました',
  decodeFailedMessage: 'Base64デコードに失敗しました。',
  withCopied: true,
});

const urlEncoder = encoderScenario({
  screen: 'url-encoder',
  path: '/url-encoder',
  heading: 'URL エンコーダー / デコーダー',
  encodePlaceholder: 'エンコードする文字列を入力してください...',
  decodePlaceholder: 'デコードするURLエンコード文字列を入力してください...',
  encodeLabel: '入力をURLエンコードする',
  decodeLabel: '入力をURLエンコードからデコードする',
  encodedMessage: 'URLエンコードしました',
  decodeFailedMessage: 'URLデコードに失敗しました。',
  withCopied: false,
});

const hashGenerator: Scenario = {
  screen: 'hash-generator',
  async run(ctx) {
    const input = (page: Page) =>
      page.getByPlaceholder('ハッシュ化する文字列を入力してください...');
    const generate = (page: Page) =>
      page.getByRole('button', { name: '入力文字列のハッシュを生成する' });

    // 通常表示 (SHA-256。「ハッシュ生成」は押せない)
    await visit(ctx, '/hash-generator', 'ハッシュ生成ツール');
    await ctx.shot('default');

    // SHA-512 で生成した
    let page = await visit(ctx, '/hash-generator', 'ハッシュ生成ツール');
    await page.getByLabel('アルゴリズム').selectOption('SHA-512');
    await input(page).fill(SAMPLE_TEXT);
    await generate(page).click();
    await page.getByText('ハッシュを生成しました').waitFor();
    await ctx.shot('generated');

    // 生成に失敗した (ブラウザが暗号 API を持たない)
    page = await ctx.freshPage();
    await page.addInitScript((key: string) => {
      window.localStorage.setItem(key, 'true');
      Object.defineProperty(globalThis.crypto, 'subtle', { value: undefined, configurable: true });
    }, MIGRATION_DIALOG_STORAGE_KEY);
    await page.goto('/hash-generator');
    await ready(page, 'ハッシュ生成ツール');
    await input(page).fill(SAMPLE_TEXT);
    await generate(page).click();
    await page.getByText('ハッシュ生成に失敗しました。').first().waitFor();
    await ctx.shot('generate-failed');
  },
};

const jsonFormatter: Scenario = {
  screen: 'json-formatter',
  async run(ctx) {
    const input = (page: Page) => page.getByPlaceholder('JSON を入力してください...');

    // 通常表示 (「整形」「圧縮」は押せない)
    await visit(ctx, '/json-formatter', 'JSON 整形ツール');
    await ctx.shot('default');

    // 整形した
    let page = await visit(ctx, '/json-formatter', 'JSON 整形ツール');
    await input(page).fill(JSON_COMPACT);
    await page.getByRole('button', { name: 'JSON を整形する' }).click();
    await page.getByText('整形が完了しました').waitFor();
    await ctx.shot('formatted');

    // 圧縮した (整形済みの JSON を 1 行にする)
    page = await visit(ctx, '/json-formatter', 'JSON 整形ツール');
    await input(page).fill(JSON.stringify(JSON.parse(JSON_COMPACT), null, 4));
    await page.getByRole('button', { name: 'JSON を圧縮する' }).click();
    await page.getByText('圧縮が完了しました').waitFor();
    await ctx.shot('minified');

    // JSON として正しくない文字列を整形した
    page = await visit(ctx, '/json-formatter', 'JSON 整形ツール');
    await input(page).fill(JSON_INVALID);
    await page.getByRole('button', { name: 'JSON を整形する' }).click();
    await page.getByText('JSONとして正しくない形式です。').first().waitFor();
    await ctx.shot('invalid-json');
  },
};

const transitConverter: Scenario = {
  screen: 'transit-converter',
  async run(ctx) {
    const input = (page: Page) =>
      page.getByPlaceholder('乗り換え案内のテキストをここに貼り付けてください...');
    const convert = (page: Page) =>
      page.getByRole('button', { name: '乗り換え案内テキストを変換する' });

    // 通常表示 (表示設定は閉じている。「変換」は押せない)
    await visit(ctx, '/transit-converter', '乗り換え変換ツール');
    await ctx.shot('default');

    // 変換した
    let page = await visit(ctx, '/transit-converter', '乗り換え変換ツール');
    await input(page).fill(TRANSIT_TEXT);
    await convert(page).click();
    await page.getByText('変換が完了しました').waitFor();
    await ctx.shot('converted');

    // 表示設定を開き、距離と番線を足した (出力に反映される)
    page = await visit(ctx, '/transit-converter', '乗り換え変換ツール');
    await input(page).fill(TRANSIT_TEXT);
    await convert(page).click();
    await page.getByText('変換が完了しました').waitFor();
    await page.getByRole('button', { name: '表示設定' }).click();
    await page.getByLabel('距離を表示').check();
    await page.getByLabel('番線情報を表示').check();
    await page.getByText('距離: 30.5 km').waitFor();
    await ctx.shot('settings-open');

    // 乗り換え案内でないテキストを変換した
    page = await visit(ctx, '/transit-converter', '乗り換え変換ツール');
    await input(page).fill(NOT_TRANSIT_TEXT);
    await convert(page).click();
    await page.getByText('乗り換え案内のテキストを正しく解析できませんでした。').first().waitFor();
    await ctx.shot('invalid-input');

    // 他のアプリから共有された (Web Share Target。URL のパラメータで届く)
    await visit(
      ctx,
      `/transit-converter?text=${encodeURIComponent(TRANSIT_TEXT)}`,
      '共有されたデータを読み込みました'
    );
    await ctx.shot('shared');
  },
};

const timestampConverter: Scenario = {
  screen: 'timestamp-converter',
  async run(ctx) {
    // 通常表示 (タイムゾーンは Asia/Tokyo。変換ボタンは押せない)
    await visit(ctx, '/timestamp-converter', 'タイムスタンプ変換ツール');
    await ctx.shot('default');

    // Unix 秒を日時にした (タイムゾーンは America/New_York)
    let page = await visit(ctx, '/timestamp-converter', 'タイムスタンプ変換ツール');
    await page.getByLabel('タイムゾーン', { exact: true }).selectOption('America/New_York');
    await page.getByPlaceholder('例: 1700000000', { exact: true }).fill('1700000000');
    await page.getByRole('button', { name: 'Unix秒を日時に変換する' }).click();
    await page.getByText('Unix秒を日時に変換しました').waitFor();
    await ctx.shot('converted');

    // 日時の形式が違う
    page = await visit(ctx, '/timestamp-converter', 'タイムスタンプ変換ツール');
    await page.getByPlaceholder('例: 2026-03-15T12:34:56').fill('2026/03/15 12:34');
    await page.getByRole('button', { name: '日時をUnixタイムスタンプに変換する' }).click();
    await page.getByText('日時は YYYY-MM-DDTHH:mm', { exact: false }).last().waitFor();
    await ctx.shot('invalid-input');
  },
};

/** VAPID キーの生成 API の応答を差し替える。鍵は実在しない固定の値にして、撮るたびに同じ画像にする */
async function routeVapid(page: Page, response: 'ok' | 'error' | 'pending'): Promise<void> {
  await page.route('**/api/vapid', (route) => {
    if (response === 'pending') return new Promise(() => undefined);
    if (response === 'error') {
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'VAPIDキーの生成に失敗しました。' }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(FAKE_VAPID_KEYS),
    });
  });
}

const vapidGenerator: Scenario = {
  screen: 'vapid-generator',
  async run(ctx) {
    const generate = (page: Page) => page.getByRole('button', { name: 'VAPIDキーを生成する' });

    // 通常表示 (鍵はまだない。コピーは押せない)
    await visit(ctx, '/vapid-generator', 'VAPID キー生成ツール');
    await ctx.shot('default');

    // 生成した
    let page = await ctx.freshPage();
    await routeVapid(page, 'ok');
    await page.addInitScript((key: string) => {
      window.localStorage.setItem(key, 'true');
    }, MIGRATION_DIALOG_STORAGE_KEY);
    await page.goto('/vapid-generator');
    await ready(page, 'VAPID キー生成ツール');
    await generate(page).click();
    await page.getByText('VAPIDキーを生成しました').waitFor();
    await ctx.shot('generated');

    // 生成中 (応答が返らない)
    page = await ctx.freshPage();
    await routeVapid(page, 'pending');
    await page.addInitScript((key: string) => {
      window.localStorage.setItem(key, 'true');
    }, MIGRATION_DIALOG_STORAGE_KEY);
    await page.goto('/vapid-generator');
    await ready(page, 'VAPID キー生成ツール');
    await generate(page).click();
    await page.locator('button[aria-busy="true"]').waitFor();
    await ctx.shot('generating');

    // 生成に失敗した (API が 500 を返す)
    page = await ctx.freshPage();
    await routeVapid(page, 'error');
    await page.addInitScript((key: string) => {
      window.localStorage.setItem(key, 'true');
    }, MIGRATION_DIALOG_STORAGE_KEY);
    await page.goto('/vapid-generator');
    await ready(page, 'VAPID キー生成ツール');
    await generate(page).click();
    await page.getByText('VAPIDキーの生成に失敗しました。').waitFor();
    await ctx.shot('generate-failed');
  },
};

export const tools: ServiceCapture = {
  service: 'tools',
  // 要件はモバイルファーストを方針にしつつ、デスクトップ (3 列) とタブレット (2 列) も対象にしていて、一つに決めていない
  devices: ['mobile', 'desktop'],
  server: {
    cwd: 'services/tools',
    build: ['npm', 'run', 'build'],
    command: ['npm', 'run', 'start', '--'],
    port: 3400,
    healthPath: '/api/health',
    requiredBuilds: ['libs/ui/dist', 'libs/nextjs/dist', 'libs/common/dist', 'libs/browser/dist'],
    // E2E にも環境変数ファイルはない。フッターのバージョン表示を固定する
    extraEnv: { APP_VERSION: '1.0.0' },
  },
  // 認証もロールもないサービス
  defaultRoles: [],
  fixedTime: '2026-02-28T01:30:00Z',
  scenarios: [
    home,
    offline,
    transitConverter,
    jsonFormatter,
    base64,
    urlEncoder,
    hashGenerator,
    timestampConverter,
    vapidGenerator,
  ],
};
