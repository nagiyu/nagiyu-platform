import type { APIRequestContext, Page } from '@playwright/test';

/**
 * niconico-mylist-assistant の撮影用データ。画面に出る値をすべてここで決め、毎回同じ画像になるようにする。
 *
 * サービスの E2E と同じく、動画は `POST /api/test/videos`、ニコニコのセッションは `POST /api/test/session` で用意する。
 * テスト用の API が作る値 (タイトル・投稿日時・長さ) は E2E 向けの決め打ちで、実行時刻にも依存するため、
 * 画面が受け取る応答の中身を `normalizeVideoResponses` で書き換えて固定する。
 */

/** 動画 ID の数字部分の先頭。i 番目の動画は `sm{FIRST_VIDEO_NUMBER + i}` */
export const FIRST_VIDEO_NUMBER = 41000000;

/** seed の動画を 1 件ずつ作るときの待ち (ms)。作成日時 (ミリ秒) が重なると、一覧の並びが実行ごとに変わるため */
const SEED_INTERVAL_MS = 3;

const THEMES = [
  '【作業用BGM】朝のピアノメドレー',
  '雨の日に聴きたいローファイ・ビート',
  '【歌ってみた】夏の終わりのバラード',
  '初心者向け 3 分でできる簡単クッキング',
  '【ゆっくり解説】日本の城のひみつ',
  '猫がキーボードの上で寝てしまった',
  '【ゲーム実況】レトロアクションを全クリアするまで',
  '深夜のドライブ用シティポップ詰め合わせ',
  '【演奏してみた】定番のギターリフ集',
  '都電荒川線のんびり車窓動画',
  '【自作PC】予算 10 万円でゲーミング構成を組む',
  '犬の散歩コースを朝から夕方まで追いかけてみた',
  '【ボカロ】星空をテーマにしたオリジナル曲',
  '雑学クイズ 100 問チャレンジ',
  '【手描き】夏祭りの一日を描いてみた',
  '長文タイトルの例 ある日の放課後に友達と寄り道した商店街で見つけた不思議な古道具屋の話をまとめました',
] as const;

const LENGTHS = ['3:24', '5:10', '12:45', '0:58', '4:02', '8:31', '2:17', '15:03'] as const;

/** 投稿日時の基準 (JST)。新しい動画ほど後ろの日付にする */
const CREATED_AT_BASE = Date.parse('2025-10-01T12:00:00+09:00');
const DAY_MS = 24 * 60 * 60 * 1000;

/** 動画 ID の連番の位置。範囲外なら undefined */
function indexOf(videoId: string): number | undefined {
  const match = /^sm(\d+)$/.exec(videoId);
  if (!match) return undefined;
  const index = Number(match[1]) - FIRST_VIDEO_NUMBER;
  return index >= 0 ? index : undefined;
}

export function videoIdOf(index: number): string {
  return `sm${FIRST_VIDEO_NUMBER + index}`;
}

function titleOf(index: number): string {
  const round = Math.floor(index / THEMES.length) + 1;
  const theme = THEMES[index % THEMES.length];
  // 長文タイトルは 2 行に収まらず省略される例として、回数を付けずにそのまま使う
  return round === 1 || index % THEMES.length === THEMES.length - 1
    ? theme
    : `${theme} その${round}`;
}

function createdAtOf(index: number): number {
  return CREATED_AT_BASE + index * 2 * DAY_MS;
}

/** 応答の中で動画を表す部分 (`videoId` と `title` を持つオブジェクト) を、撮影用の値に書き換える */
function normalizeVideo(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeVideo);
  if (value === null || typeof value !== 'object') return value;

  const record = value as Record<string, unknown>;
  const index = typeof record.videoId === 'string' ? indexOf(record.videoId) : undefined;
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(record)) {
    next[key] = normalizeVideo(child);
  }
  if (index === undefined) return next;

  if ('title' in next) next.title = titleOf(index);
  if ('length' in next) next.length = LENGTHS[index % LENGTHS.length];
  if ('createdAt' in next) next.createdAt = createdAtOf(index);
  if ('updatedAt' in next) next.updatedAt = createdAtOf(index);
  return next;
}

/**
 * 動画の一覧・取得・設定更新の応答を、撮影用の値に書き換える。
 * 検索と一括インポートは別に差し替えるので対象にしない
 */
export async function normalizeVideoResponses(page: Page): Promise<void> {
  await page.route(/\/api\/videos(\/sm\d+(\/settings)?)?(\?.*)?$/, async (route) => {
    const method = route.request().method();
    if (method !== 'GET' && method !== 'PUT') return route.fallback();
    const response = await route.fetch();
    const body = await response.json().catch(() => null);
    if (body === null) return route.fulfill({ response });
    return route.fulfill({ response, json: normalizeVideo(body) });
  });
}

/** seed の動画のサムネイル。外部へ出ず、動画ごとに色が変わる固定の画像にする */
export async function stubThumbnails(page: Page): Promise<void> {
  await page.route('https://example.com/**', async (route) => {
    const videoId = new URL(route.request().url()).pathname.replace(/^\/|\.jpg$/g, '');
    const hue = ((indexOf(videoId) ?? 0) * 47) % 360;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="hsl(${hue},55%,62%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360},55%,42%)"/>
</linearGradient></defs>
<rect width="320" height="180" fill="url(#g)"/>
<text x="160" y="98" font-size="28" fill="white" text-anchor="middle" font-family="sans-serif">${videoId}</text>
</svg>`;
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg });
  });
}

/** 撮影の前提として用意するデータ */
export interface NiconicoSeed {
  /** 作る動画の数。0 番目が最も古く、後の番号ほど新しい (一覧は新しい順) */
  videos?: number;
  /** お気に入りにする動画の番号 */
  favorites?: number[];
  /** スキップにする動画の番号 */
  skips?: number[];
  /** メモを付ける動画の番号とその内容 */
  memos?: Record<number, string>;
  /** ニコニコのセッションを保存済みにするか (保存の中身はダミー) */
  session?: boolean;
}

/** `ServiceCapture.resetData`: テスト用の API でデータを空にして、`seed` を投入する */
export async function resetNiconicoData(
  request: APIRequestContext,
  baseUrl: string,
  seed: unknown
): Promise<void> {
  const data = seed as NiconicoSeed;
  const url = (path: string) => new URL(path, baseUrl).toString();
  const expectOk = async (
    label: string,
    response: Awaited<ReturnType<APIRequestContext['get']>>
  ) => {
    if (!response.ok()) {
      throw new Error(`データの初期化に失敗しました (${label}): ${response.status()}`);
    }
  };

  await expectOk('動画の削除', await request.delete(url('/api/test/videos')));
  await expectOk('セッションの削除', await request.delete(url('/api/test/session')));

  const count = data.videos ?? 0;
  for (let i = 0; i < count; i++) {
    await expectOk(
      `動画の作成 ${i}`,
      await request.post(url('/api/test/videos'), {
        data: {
          count: 1,
          startId: FIRST_VIDEO_NUMBER + i,
          favoriteCount: data.favorites?.includes(i) ? 1 : 0,
        },
      })
    );
    await new Promise((resolve) => setTimeout(resolve, SEED_INTERVAL_MS));
  }

  // お気に入り以外の設定 (スキップ・メモ) は、画面と同じ設定更新 API で付ける
  const settings = new Map<number, { isSkip?: boolean; memo?: string }>();
  for (const i of data.skips ?? []) settings.set(i, { ...settings.get(i), isSkip: true });
  for (const [i, memo] of Object.entries(data.memos ?? {})) {
    settings.set(Number(i), { ...settings.get(Number(i)), memo });
  }
  for (const [i, body] of settings) {
    await expectOk(
      `設定の更新 ${i}`,
      await request.put(url(`/api/videos/${videoIdOf(i)}/settings`), { data: body })
    );
  }

  if (data.session) {
    await expectOk('セッションの作成', await request.post(url('/api/test/session')));
  }
}
