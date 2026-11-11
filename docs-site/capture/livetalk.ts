import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import type { Scenario, ScenarioContext, ServiceCapture } from './types';
import {
  CHAT,
  FAKE_PUSH_ENDPOINT,
  FAKE_PUSH_KEYS,
  FAKE_PUSH_PORT,
  FAKE_VAPID,
  FIRST_WORD,
  FIXED_TIME,
  NOTES,
  NOTE_DETAIL,
  NOTE_DETAIL_HEADLINE_ONLY,
  PENDING,
  SAFETY_RESOURCES,
  SELF_FACTS,
  SNOOZED_AT,
} from './livetalk-data';

/**
 * livetalk の撮影シナリオ。画面ごとに、カードで紹介する状態を撮る。
 * 状態を足したら、カードの「画面の見た目」にも同じ名前で足す。
 *
 * このサービスの E2E は DynamoDB を持たず、画面の描画だけを確かめている。
 * 撮影ではインメモリ DB (`USE_IN_MEMORY_DB`) で起動し、次のように分ける。
 * - クライアントが読む API (同意・記憶・ノート・通知・チャット) は `page.route` で固定の応答に差し替える。
 *   LLM と音声合成の外部への通信は、チャットの応答を差し替えるので発生しない
 * - サーバーで描く画面 (ステータス) は、サーバー自身の API を呼んでデータを作る。
 *   サーバーの時計は撮影の固定時刻に止め (livetalk-capture-preload.cjs)、Web Push の送信先は偽のサーバーにする
 */

const ADMIN_ROLES = ['livetalk-admin'];
const NO_PERMISSION_ROLES = ['user-manager'];

/** 描画が落ち着くまで待つ。待つ対象のテキストを明示する */
async function ready(page: Page, text: string): Promise<void> {
  await page.getByText(text, { exact: false }).first().waitFor();
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
}

async function mockJson(page: Page, pattern: string, body: unknown, status = 200): Promise<void> {
  await page.route(pattern, (route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  );
}

/** 応答が返らないままにする (読み込み中・応答待ちの状態を撮るため) */
async function hang(page: Page, pattern: string): Promise<void> {
  await page.route(pattern, () => new Promise(() => undefined));
}

/** 画面が自分で報告するエラーログの送信を、撮影のサーバーへ流さない */
async function muteClientLog(page: Page): Promise<void> {
  await page.route('**/api/client-log', (route) => route.fulfill({ status: 204 }));
}

/** チャット API の応答 (NDJSON)。1 行 1 イベント */
function ndjson(events: object[]): string {
  return events.map((event) => JSON.stringify(event)).join('\n') + '\n';
}

async function mockChat(page: Page, events: object[]): Promise<void> {
  await page.route('**/api/chat', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/x-ndjson',
      body: ndjson(events),
    })
  );
}

/** 画面を開くたびに作られるホーム画面案内・通知許可の案内を出さない (「あとでね」を押した状態にする) */
async function snoozeOnboarding(page: Page): Promise<void> {
  await page.addInitScript((snoozedAt: number) => {
    localStorage.setItem('livetalk-install-snoozed-at', String(snoozedAt));
    localStorage.setItem('livetalk-notification-snoozed-at', String(snoozedAt));
  }, SNOOZED_AT);
}

/** 選んだキャラクターを、画面を開く前にローカルストレージへ入れる */
async function selectCharacter(page: Page, characterId: string): Promise<void> {
  await page.addInitScript((id: string) => {
    localStorage.setItem('livetalk:selectedCharacterId', JSON.stringify(id));
  }, characterId);
}

/**
 * ホーム画面が開くときに読む API を、既定の応答にそろえる。
 * 同意済み・生活サイクルは起きている・未消化の通知はない、が既定。
 */
async function mockHomeApis(page: Page, consented = true): Promise<void> {
  await muteClientLog(page);
  await mockJson(page, '**/api/consent', { consented });
  await mockJson(page, '**/api/lifecycle*', { state: 'awake' });
  await page.route('**/api/push/first-word*', (route) => route.fulfill({ status: 204 }));
  await mockJson(page, '**/api/push/pending', []);
}

/** 同意済みで、案内を出さないホーム画面を開く */
async function openHome(ctx: ScenarioContext, path = '/'): Promise<Page> {
  const page = await ctx.freshPage();
  await snoozeOnboarding(page);
  await mockHomeApis(page);
  await page.goto(path);
  await ready(page, 'メッセージを入力すると');
  return page;
}

/**
 * ブラウザの Push 購読の部品を差し替える。
 * ヘッドレスの Chromium は通知の許可ダイアログを出せず、購読の状態も作れないため。
 */
async function mockPush(page: Page, mode: 'subscribed' | 'denied'): Promise<void> {
  await page.addInitScript((m: string) => {
    const subscription = {
      endpoint: 'https://push.example.com/send/capture',
      toJSON() {
        return {
          endpoint: this.endpoint,
          keys: { p256dh: 'p256dh-capture', auth: 'auth-capture' },
        };
      },
    };
    const registration = {
      pushManager: {
        getSubscription: async () => (m === 'subscribed' ? subscription : null),
        subscribe: async () => {
          throw new Error('permission denied');
        },
      },
    };
    Object.defineProperty(window, 'PushManager', {
      value: function PushManager() {},
      configurable: true,
    });
    Object.defineProperty(window.Notification, 'permission', {
      get: () => (m === 'denied' ? 'denied' : 'granted'),
      configurable: true,
    });
    Object.defineProperty(window.Notification, 'requestPermission', {
      value: async () => (m === 'denied' ? 'denied' : 'granted'),
      configurable: true,
    });
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        getRegistration: async () => registration,
        register: async () => registration,
        ready: Promise.resolve(registration),
      },
      configurable: true,
    });
  }, mode);
}

/** ホーム画面のスタンドアロン表示 (ホーム画面に追加した PWA) を装う */
async function mockStandalone(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = (query: string) =>
      query.includes('display-mode: standalone')
        ? ({
            matches: true,
            media: query,
            onchange: null,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
            addListener: () => undefined,
            removeListener: () => undefined,
            dispatchEvent: () => false,
          } as unknown as MediaQueryList)
        : original(query);
  });
}

const home: Scenario = {
  screen: 'home',
  async run(ctx) {
    const message = (page: Page) => page.getByLabel('メッセージ');
    const send = (page: Page) => page.getByRole('button', { name: '送信' });

    // 通常表示 (同意済み。入力欄とお知らせの案内)
    await openHome(ctx);
    await ctx.shot('default');

    // 初回アクセス (同意のダイアログ)
    let page = await ctx.freshPage();
    await snoozeOnboarding(page);
    await mockHomeApis(page, false);
    await page.goto('/');
    await page.getByText('リブトークへようこそ').waitFor();
    await ctx.shot('consent');

    // 同意の送信に失敗した (3 つにチェックして「利用開始」)
    await page.route('**/api/consent', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'SAVE_FAILED' }),
          })
        : route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ consented: false }),
          })
    );
    for (const checkbox of await page.getByRole('dialog').getByRole('checkbox').all()) {
      await checkbox.check();
    }
    await page.getByTestId('consent-submit').click();
    await page.getByTestId('consent-error').waitFor();
    await ctx.shot('consent-error');

    // ホーム画面に追加する案内 (ブラウザで開いたとき)
    page = await ctx.freshPage();
    await mockHomeApis(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'ホーム画面に追加する' }).waitFor();
    await ctx.shot('install-guide');

    // 通知を許可する案内 (ホーム画面に追加した PWA で、通知が未許可のとき)
    page = await ctx.freshPage();
    await mockStandalone(page);
    await mockHomeApis(page);
    await page.goto('/');
    await page.getByRole('button', { name: '通知を許可する' }).waitFor();
    await ctx.shot('notification-permission');

    // お知らせを受け取る設定になっている
    page = await ctx.freshPage();
    await snoozeOnboarding(page);
    await mockPush(page, 'subscribed');
    await mockHomeApis(page);
    await page.goto('/');
    await page.getByText('お知らせを受け取る設定になっているよ').waitFor();
    await ctx.shot('notification-subscribed');

    // ブラウザで通知を拒否している
    page = await ctx.freshPage();
    await snoozeOnboarding(page);
    await mockPush(page, 'denied');
    await mockHomeApis(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'お知らせを受け取る' }).click();
    await page.getByText('ブラウザの設定から通知を許可してね').waitFor();
    await ctx.shot('notification-denied');

    // 応答待ち (応答が返らない)
    page = await ctx.freshPage();
    await snoozeOnboarding(page);
    await mockHomeApis(page);
    await hang(page, '**/api/chat');
    await page.goto('/');
    await ready(page, 'メッセージを入力すると');
    await message(page).fill(CHAT.user);
    await send(page).click();
    await page.getByText('考え中…').waitFor();
    await ctx.shot('waiting');

    // 応答が届いた
    page = await ctx.freshPage();
    await snoozeOnboarding(page);
    await mockHomeApis(page);
    await mockChat(page, [
      { type: 'lifecycle', state: 'awake' },
      { type: 'text', delta: CHAT.reply },
      { type: 'done' },
    ]);
    await page.goto('/');
    await ready(page, 'メッセージを入力すると');
    await message(page).fill(CHAT.user);
    await send(page).click();
    await page.getByText(CHAT.reply).waitFor();
    await page.getByText('待機中').waitFor();
    await ctx.shot('replied');

    // 送信が多すぎる (429)
    page = await ctx.freshPage();
    await snoozeOnboarding(page);
    await mockHomeApis(page);
    await mockJson(
      page,
      '**/api/chat',
      { error: 'RATE_LIMIT_EXCEEDED', message: 'リクエストが多すぎます' },
      429
    );
    await page.goto('/');
    await ready(page, 'メッセージを入力すると');
    await message(page).fill(CHAT.user);
    await send(page).click();
    await page.getByRole('alert').filter({ hasText: '休憩させてね' }).waitFor();
    await ctx.shot('rate-limited');

    // 応答に失敗した (500)
    page = await ctx.freshPage();
    await snoozeOnboarding(page);
    await mockHomeApis(page);
    await mockJson(page, '**/api/chat', { error: 'INTERNAL_ERROR', message: 'error' }, 500);
    await page.goto('/');
    await ready(page, 'メッセージを入力すると');
    await message(page).fill(CHAT.user);
    await send(page).click();
    await page.getByRole('alert').filter({ hasText: 'うまく話せない' }).waitFor();
    await ctx.shot('chat-error');

    // セーフティ介入 (相談先のダイアログ)
    page = await ctx.freshPage();
    await snoozeOnboarding(page);
    await mockHomeApis(page);
    await mockChat(page, [
      { type: 'text', delta: CHAT.safetyReply },
      { type: 'safety', trigger: 'input_keyword', resources: SAFETY_RESOURCES },
      { type: 'done' },
    ]);
    await page.goto('/');
    await ready(page, 'メッセージを入力すると');
    await message(page).fill(CHAT.safetyUser);
    await send(page).click();
    await page.getByText('相談できる場所があるよ').waitFor();
    await ctx.shot('safety');

    // 通知から開いた (第一声と、入力欄の下書き)
    page = await ctx.freshPage();
    await snoozeOnboarding(page);
    await mockHomeApis(page);
    await mockJson(page, '**/api/push/first-word*', {
      notifId: FIRST_WORD.notifId,
      body: FIRST_WORD.body,
      characterId: FIRST_WORD.characterId,
      suggestedReply: FIRST_WORD.suggestedReply,
    });
    await mockJson(page, '**/api/push/consumed', { success: true });
    await page.goto('/?character=hiyori&from=push');
    await page.getByText(FIRST_WORD.body).waitFor();
    await ctx.shot('first-word');

    // 別のキャラクターから連絡が来ている
    page = await ctx.freshPage();
    await snoozeOnboarding(page);
    await mockHomeApis(page);
    await mockJson(page, '**/api/push/pending', PENDING);
    await page.goto('/');
    await page.getByText('アゲハから連絡が来てるよ').waitFor();
    await ctx.shot('pending-notification');

    // キャラクターを選ぶダイアログ
    page = await openHome(ctx);
    await page.getByRole('button', { name: /キャラ：/ }).click();
    await page.getByRole('dialog').waitFor();
    await ctx.shot('character-select', { around: page.getByRole('dialog') });

    // ヘッダーのメニュー (ナビゲーションの項目)
    page = await openHome(ctx);
    await page.getByRole('button', { name: 'メニューを開く' }).click();
    await page.locator('[aria-label="ナビゲーションメニュー"]').waitFor();
    await ctx.shot('navigation-menu');

    // ヘッダーのメニュー (livetalk:admin は「ステータス」が加わる)
    page = await ctx.freshPage({ roles: ADMIN_ROLES });
    await snoozeOnboarding(page);
    await mockHomeApis(page);
    await page.goto('/');
    await ready(page, 'メッセージを入力すると');
    await page.getByRole('button', { name: 'メニューを開く' }).click();
    await page.locator('[aria-label="ナビゲーションメニュー"]').getByText('ステータス').waitFor();
    await ctx.shot('navigation-menu-admin');

    // アカウントのメニュー
    page = await openHome(ctx);
    await page.getByRole('button', { name: 'アカウントメニュー' }).click();
    await page.getByTestId('account-menu-delete-account').waitFor();
    await ctx.shot('account-menu');

    // 退会・データ削除の確認 (チェック前は「退会・削除する」が押せない)
    page = await openHome(ctx);
    await page.getByRole('button', { name: 'アカウントメニュー' }).click();
    await page.getByTestId('account-menu-delete-account').click();
    await page.getByRole('dialog').getByText('退会・データ削除').first().waitFor();
    await ctx.shot('deletion-dialog', { around: page.getByRole('dialog') });

    // 退会の処理に失敗した
    await mockJson(page, '**/api/account', { error: 'DELETE_FAILED' }, 500);
    await page.getByRole('dialog').getByRole('checkbox').check();
    await page.getByTestId('deletion-confirm').click();
    await page.getByTestId('deletion-error').waitFor();
    await ctx.shot('deletion-error', { around: page.getByRole('dialog') });
  },
};

const memory: Scenario = {
  screen: 'memory',
  async run(ctx) {
    const open = async (prepare: (page: Page) => Promise<void>, waitFor: string) => {
      const page = await ctx.freshPage();
      await snoozeOnboarding(page);
      await muteClientLog(page);
      await prepare(page);
      await page.goto('/memory');
      await page.getByText(waitFor, { exact: false }).first().waitFor();
      return page;
    };

    // 通常表示 (話題ごとにまとまる)
    let page = await open(
      (p) => mockJson(p, '**/api/memory*', { selfFacts: SELF_FACTS }),
      'デザインの仕事をしている'
    );
    await ctx.shot('default');

    // 削除の確認
    await page.getByTestId('memory-delete').first().click();
    await page.getByRole('dialog').waitFor();
    await ctx.shot('delete-dialog', { around: page.getByRole('dialog') });

    // 削除に失敗した
    await page.route('**/api/memory/*', (route) =>
      route.request().method() === 'DELETE'
        ? route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'DELETE_FAILED' }),
          })
        : route.fallback()
    );
    await page.getByTestId('memory-delete-confirm').click();
    await page.getByTestId('delete-error').waitFor();
    await ctx.shot('delete-error', { around: page.getByRole('dialog') });

    // 覚えていることがない
    await open((p) => mockJson(p, '**/api/memory*', { selfFacts: [] }), 'まだここに覚えて');
    await ctx.shot('empty');

    // 読み込み中 (応答が返らない)
    page = await ctx.freshPage();
    await snoozeOnboarding(page);
    await hang(page, '**/api/memory*');
    await page.goto('/memory');
    await page.getByTestId('memory-loading').waitFor();
    await ctx.shot('loading');

    // 取得に失敗した
    await open(
      (p) => mockJson(p, '**/api/memory*', { error: 'FETCH_FAILED' }, 500),
      '覚えていることの取得に失敗しました'
    );
    await ctx.shot('fetch-error');

    // 別のキャラクター (アゲハ) を選んでいる
    page = await ctx.freshPage();
    await snoozeOnboarding(page);
    await selectCharacter(page, 'ageha');
    await mockJson(page, '**/api/memory*', { selfFacts: [] });
    await page.goto('/memory');
    await page.getByText('アゲハちゃんがあなたについて覚えていることだよ').waitFor();
    await ctx.shot('character-ageha');
  },
};

const notes: Scenario = {
  screen: 'notes',
  async run(ctx) {
    const open = async (prepare: (page: Page) => Promise<void>, waitFor: string) => {
      const page = await ctx.freshPage();
      await snoozeOnboarding(page);
      await prepare(page);
      await page.goto('/notes');
      await page.getByText(waitFor, { exact: false }).first().waitFor();
      return page;
    };

    // 通常表示 (贈られた日の新しい順)
    await open((p) => mockJson(p, '**/api/notes*', { notes: NOTES }), '和菓子の食べ比べ');
    await ctx.shot('default');

    // ノートがない
    await open((p) => mockJson(p, '**/api/notes*', { notes: [] }), 'まだノートはないよ');
    await ctx.shot('empty');

    // 読み込み中 (応答が返らない)
    const page = await ctx.freshPage();
    await snoozeOnboarding(page);
    await hang(page, '**/api/notes*');
    await page.goto('/notes');
    await page.getByTestId('note-loading').waitFor();
    await ctx.shot('loading');

    // 取得に失敗した
    await open(
      (p) => mockJson(p, '**/api/notes*', { error: 'FETCH_FAILED' }, 500),
      'ノートの取得に失敗しました'
    );
    await ctx.shot('fetch-error');
  },
};

const noteDetail: Scenario = {
  screen: 'note-detail',
  async run(ctx) {
    const open = async (id: string, prepare: (page: Page) => Promise<void>, waitFor: string) => {
      const page = await ctx.freshPage();
      await snoozeOnboarding(page);
      await prepare(page);
      await page.goto(`/notes/${id}`);
      await page.getByText(waitFor, { exact: false }).first().waitFor();
      return page;
    };

    // 通常表示 (手紙、調べた内容、出典)
    await open(
      NOTE_DETAIL.id,
      (p) => mockJson(p, `**/api/notes/${NOTE_DETAIL.id}`, { note: NOTE_DETAIL }),
      '調べた内容（最新）'
    );
    await ctx.shot('default');

    // 手紙だけ (参照先の話題を読めなかったとき、調べた内容と出典は出ない)
    await open(
      NOTE_DETAIL_HEADLINE_ONLY.id,
      (p) =>
        mockJson(p, `**/api/notes/${NOTE_DETAIL_HEADLINE_ONLY.id}`, {
          note: NOTE_DETAIL_HEADLINE_ONLY,
        }),
      '朝に光を浴びる'
    );
    await ctx.shot('headline-only');

    // 読み込み中 (応答が返らない)
    const page = await ctx.freshPage();
    await snoozeOnboarding(page);
    await hang(page, '**/api/notes/*');
    await page.goto('/notes/note-loading');
    await page.getByTestId('note-detail-loading').waitFor();
    await ctx.shot('loading');

    // ノートが見つからない (404)
    await open(
      'note-missing',
      (p) => mockJson(p, '**/api/notes/note-missing', { error: 'NOT_FOUND' }, 404),
      'ノートの取得に失敗しました'
    );
    await ctx.shot('not-found');
  },
};

const status: Scenario = {
  screen: 'status',
  async run(ctx) {
    const gotoStatus = async (page: Page, path = '/status') => {
      await page.goto(path);
      await ready(page, 'ステータス（デバッグ）');
    };
    const testButton = (page: Page, name: string) =>
      page.getByRole('button', { name: `${name} にテスト通知` });

    // 履歴がない (サーバーを起動した直後)
    let page = await ctx.freshPage({ roles: ADMIN_ROLES });
    await gotoStatus(page);
    await ctx.shot('no-history');

    // テスト通知を送ったが、購読がない
    await testButton(page, '早瀬アゲハ').click();
    await page.getByText('購読なし（送信されませんでした）').waitFor();
    await page.mouse.move(0, 0);
    await ctx.shot('test-push-no-subscription');

    // 購読を登録し、セーフティの検出と通知の履歴を作る (サーバー自身の API を呼ぶ)
    const subscribed = await page.request.post('/api/push/subscribe', {
      data: { subscription: { endpoint: FAKE_PUSH_ENDPOINT, keys: FAKE_PUSH_KEYS } },
    });
    if (!subscribed.ok()) throw new Error(`購読の登録に失敗しました: ${subscribed.status()}`);
    const chat = await page.request.post('/api/chat', {
      data: { text: CHAT.riskyInput, characterId: 'hiyori' },
    });
    if (!chat.ok()) throw new Error(`チャットの送信に失敗しました: ${chat.status()}`);
    await chat.text();

    // テスト通知を送れた
    page = await ctx.freshPage({ roles: ADMIN_ROLES });
    await gotoStatus(page);
    await testButton(page, '桃瀬ひより').click();
    await page.getByText('送信完了（1 件）').waitFor();
    await page.mouse.move(0, 0);
    await ctx.shot('test-push-sent');

    // 通常表示 (通知の履歴とセーフティの検出が並ぶ)
    page = await ctx.freshPage({ roles: ADMIN_ROLES });
    await gotoStatus(page);
    await page.getByText('キーワード検出').waitFor();
    await ctx.shot('default');

    // 権限がない (livetalk:admin を持たない)
    page = await ctx.freshPage({ roles: NO_PERMISSION_ROLES });
    await page.goto('/status');
    await ready(page, 'アクセス権限がありません');
    await ctx.shot('access-denied');
  },
};

const forbidden: Scenario = {
  screen: 'forbidden',
  async run(ctx) {
    // 通常表示 (権限がないページから飛ばされた)
    const page = await ctx.freshPage();
    await page.goto('/forbidden?from=%2Fnotes');
    await ready(page, 'アクセス権限がありません');
    await ctx.shot('default');
  },
};

const terms: Scenario = {
  screen: 'terms',
  async run(ctx) {
    const page = await ctx.freshPage();
    await page.goto('/legal/terms');
    await ready(page, 'バージョン');
    // 本文は長いので、画面の上部だけを撮る
    await ctx.shot('default', { viewportOnly: true });
  },
};

const privacy: Scenario = {
  screen: 'privacy',
  async run(ctx) {
    const page = await ctx.freshPage();
    await page.goto('/legal/privacy');
    await ready(page, 'バージョン');
    await ctx.shot('default', { viewportOnly: true });
  },
};

export const livetalk: ServiceCapture = {
  service: 'livetalk',
  // 要件の優先プラットフォームはモバイル PWA で、外部設計もモバイルを前提にしている (PC はモバイルレイアウトの拡大表示)
  devices: ['mobile'],
  server: {
    cwd: 'services/livetalk/web',
    build: ['npm', 'run', 'build'],
    command: ['npm', 'run', 'start', '--'],
    port: 3405,
    healthPath: '/api/health',
    envFile: 'services/livetalk/web/.env.test',
    requiredBuilds: [
      'libs/ui/dist',
      'libs/nextjs/dist',
      'libs/aws/dist',
      'libs/react/dist',
      'libs/common/dist',
      'libs/browser/dist',
      'services/livetalk/core/dist',
    ],
    // E2E の設定 (認証を飛ばす) に、インメモリ DB と、外部へ出ないためのダミーの値を足す。
    // OPENAI_API_KEY はクライアントの生成に要るだけで、チャットは差し替えるため API は呼ばれない
    extraEnv: {
      USE_IN_MEMORY_DB: 'true',
      VOICEVOX_URL: 'http://127.0.0.1:59999',
      OPENAI_API_KEY: 'capture-dummy-openai-key',
      // 本番の ECS と同じく、生活サイクルの時間帯を日本時間で判定する
      TZ: 'Asia/Tokyo',
      NEXTAUTH_URL: 'http://localhost:3405',
      APP_URL: 'http://localhost:3405',
      VAPID_PUBLIC_KEY: FAKE_VAPID.publicKey,
      VAPID_PRIVATE_KEY: FAKE_VAPID.privateKey,
      CAPTURE_SERVER_NOW: FIXED_TIME,
      CAPTURE_PUSH_PORT: String(FAKE_PUSH_PORT),
      NODE_OPTIONS: [
        process.env.NODE_OPTIONS,
        `--require ${resolve(__dirname, 'livetalk-capture-preload.cjs')}`,
      ]
        .filter(Boolean)
        .join(' '),
    },
    companions: [
      {
        command: ['node', 'docs-site/capture/livetalk-fake-push-server.cjs'],
        env: { CAPTURE_PUSH_PORT: String(FAKE_PUSH_PORT) },
        healthUrl: `http://127.0.0.1:${FAKE_PUSH_PORT}/__health`,
        requiredFiles: ['docs-site/capture/livetalk-fake-push-server.cjs'],
      },
    ],
  },
  defaultRoles: ['livetalk-user'],
  fixedTime: FIXED_TIME,
  // サーバーで描くステータスが、サーバー自身に作らせたデータを読むため、データを作る画面は他の画面のあとに置く
  scenarios: [home, memory, notes, noteDetail, forbidden, terms, privacy, status],
};
