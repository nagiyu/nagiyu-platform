import type { Page } from '@playwright/test';
import type { Scenario, ServiceCapture } from './types';
import {
  ANALYZING_JOB,
  ANONYMOUS_USAGE,
  CLIPPING_JOB,
  COMPLETED_JOB,
  EXHAUSTED_USAGE,
  FAILED_CLIP_HIGHLIGHTS,
  FAILED_JOB,
  FREE_USAGE,
  GB,
  HIGHLIGHTS,
  IMA_SDK_STUB,
  JOB_ID,
  MB,
  MISSING_JOB_ID,
  OVER_LIMIT_DURATION_SEC,
  PENDING_JOB,
  REGENERATING_HIGHLIGHTS,
  SAMPLE_CLIP_WEBM_BASE64,
  SELECTED_HIGHLIGHT_ORDER,
  SKIPPED_AI_JOB,
  TRANSCRIPT_SEGMENTS,
  type HighlightResponse,
  type JobResponse,
} from './quick-clip-data';

/**
 * quick-clip の撮影シナリオ。画面ごとに、カードで紹介する状態を撮る。
 * 状態を足したら、カードの「画面の見た目」にも同じ名前で足す。
 *
 * このサービスの E2E は、API の応答をブラウザ側で差し替えて画面を確かめている。
 * 撮影も同じ作りにし、AWS には何もつながない。サーバーは AWS の設定なしで起動し、
 * API の呼び出しはすべて `page.route` で受ける。
 */

/** 描画が落ち着くまで待つ。待つ対象のテキストを明示する */
async function ready(page: Page, text: string): Promise<void> {
  await page.getByText(text, { exact: false }).first().waitFor();
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
}

function json(body: unknown, status = 200) {
  return { status, contentType: 'application/json', body: JSON.stringify(body) };
}

async function mockUsage(page: Page, body: unknown): Promise<void> {
  await page.route('**/api/usage', (route) => route.fulfill(json(body)));
}

async function mockJob(page: Page, job: JobResponse): Promise<void> {
  await page.route(`**/api/jobs/${job.jobId}`, (route) => route.fulfill(json(job)));
}

/** IMA SDK の読み込みを、広告枠が出たままになる代役にする */
async function mockAdPlaying(page: Page): Promise<void> {
  await page.route('https://imasdk.googleapis.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: IMA_SDK_STUB })
  );
}

/** IMA SDK の読み込みを失敗させる。広告ブロッカーと同じで、画面は広告を終えたものとして進む */
async function mockAdBlocked(page: Page): Promise<void> {
  await page.route('https://imasdk.googleapis.com/**', (route) => route.abort());
}

/**
 * アップロード欄にファイルを選んだことにする。
 * 20GB を超える実体を作らずに済むよう、中身は空のまま大きさだけを申告する。
 */
async function chooseFile(
  page: Page,
  file: { name: string; type: string; sizeBytes: number }
): Promise<void> {
  await page.locator('input[type="file"]').evaluate((input, f) => {
    const picked = new File([''], f.name, { type: f.type });
    Object.defineProperty(picked, 'size', { value: f.sizeBytes });
    Object.defineProperty(input, 'files', { value: [picked], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, file);
}

const SAMPLE_VIDEO = { name: 'game-stream-2026-02-27.mp4', type: 'video/mp4', sizeBytes: 48 * MB };
const UPLOAD_BUTTON = 'アップロードして処理開始';

/** 画面を開き、残り回数の表示が出るまで待つ */
async function openUpload(page: Page, usage: unknown): Promise<void> {
  await mockUsage(page, usage);
  await page.goto('/');
  await ready(page, '今月の残り');
}

const upload: Scenario = {
  screen: 'upload',
  async run(ctx) {
    const start = (page: Page) => page.getByRole('button', { name: UPLOAD_BUTTON });

    // 通常表示 (ログイン済みの無料の段。ファイル未選択で「アップロードして処理開始」は押せない)
    let page = await ctx.freshPage();
    await openUpload(page, FREE_USAGE);
    await ctx.shot('default');

    // ファイルを選んだ
    page = await ctx.freshPage();
    await openUpload(page, FREE_USAGE);
    await chooseFile(page, SAMPLE_VIDEO);
    await page.getByText('選択中:').waitFor();
    await ctx.shot('file-selected');

    // AI 解析をオフにした (残り回数は AI 解析なしの分だけを使う)
    page = await ctx.freshPage();
    await openUpload(page, FREE_USAGE);
    await chooseFile(page, SAMPLE_VIDEO);
    await page.getByText('選択中:').waitFor();
    await page.getByRole('switch', { name: /AI 解析/ }).uncheck();
    await ctx.shot('ai-off');

    // 未ログイン (AI 解析ありの上限が 0 回なので選べず、ログインを案内する)
    page = await ctx.freshPage();
    await openUpload(page, ANONYMOUS_USAGE);
    await page.getByText('ログインすると AI 解析を月 1 回お試しできます').waitFor();
    await ctx.shot('anonymous');

    // AI 解析ありを使い切った (プランの画面を案内する)
    page = await ctx.freshPage();
    await openUpload(page, EXHAUSTED_USAGE);
    await page.getByText('今月の AI 解析の回数を使い切りました').waitFor();
    await ctx.shot('ai-exhausted');

    // 残り回数を取得できなかった (残りの表示と AI 解析のスイッチを出さない)
    page = await ctx.freshPage();
    await page.route('**/api/usage', (route) => route.fulfill(json({}, 500)));
    await page.goto('/');
    await ready(page, '動画をアップロードして見どころ抽出を開始します');
    await chooseFile(page, SAMPLE_VIDEO);
    await page.getByText('選択中:').waitFor();
    await ctx.shot('usage-unavailable');

    // MP4 でないファイルを選んだ
    page = await ctx.freshPage();
    await openUpload(page, FREE_USAGE);
    await chooseFile(page, { name: 'notes.txt', type: 'text/plain', sizeBytes: 2048 });
    await page.getByText('MP4 形式の動画ファイルのみアップロードできます').waitFor();
    await ctx.shot('invalid-type');

    // 20GB を超えるファイルを選んだ
    page = await ctx.freshPage();
    await openUpload(page, FREE_USAGE);
    await chooseFile(page, { name: 'long-archive.mp4', type: 'video/mp4', sizeBytes: 21 * GB });
    await page.getByText('ファイルサイズが不正です').waitFor();
    await ctx.shot('too-large');

    // 動画の長さが段の上限 (無料は 120 分) を超えている。ブラウザが返す再生時間を差し替える
    page = await ctx.freshPage();
    await page.addInitScript((durationSec: number) => {
      Object.defineProperty(HTMLMediaElement.prototype, 'duration', { get: () => durationSec });
      Object.defineProperty(HTMLMediaElement.prototype, 'src', {
        set(this: HTMLMediaElement) {
          setTimeout(() => this.dispatchEvent(new Event('loadedmetadata')), 0);
        },
        get: () => '',
      });
    }, OVER_LIMIT_DURATION_SEC);
    await openUpload(page, FREE_USAGE);
    await chooseFile(page, SAMPLE_VIDEO);
    await page.getByText('を超えています').waitFor();
    await ctx.shot('duration-exceeded');

    // アップロード中 (100MB 以上は分割して送る。4 つのうち 2 つが終わった状態)
    page = await ctx.freshPage();
    const partUrls = [1, 2, 3, 4].map((n) => `${ctx.baseUrl}/__capture/part/${n}`);
    await page.route('**/api/jobs', (route) =>
      route.fulfill(
        json(
          {
            jobId: JOB_ID,
            multipart: { uploadId: 'upload-1', uploadUrls: partUrls, chunkSize: 50 * MB },
            expiresIn: 86_400,
          },
          201
        )
      )
    );
    await page.route('**/__capture/part/*', (route) => {
      const part = Number(route.request().url().split('/').pop());
      // 3 つ目以降は応答を返さず、進捗を途中のままにする
      return part <= 2
        ? route.fulfill({ status: 200, headers: { etag: `"part-${part}"` }, body: '' })
        : new Promise(() => undefined);
    });
    await openUpload(page, FREE_USAGE);
    await chooseFile(page, { ...SAMPLE_VIDEO, sizeBytes: 200 * MB });
    await page.getByText('選択中:').waitFor();
    await start(page).click();
    await page.getByText('アップロード中... 50%').first().waitFor();
    await ctx.shot('uploading');

    // ジョブの作成に失敗した
    page = await ctx.freshPage();
    await page.route('**/api/jobs', (route) =>
      route.fulfill(
        json({ error: 'INTERNAL_SERVER_ERROR', message: 'ジョブの作成に失敗しました' }, 500)
      )
    );
    await openUpload(page, FREE_USAGE);
    await chooseFile(page, SAMPLE_VIDEO);
    await page.getByText('選択中:').waitFor();
    await start(page).click();
    await page.getByText('ジョブの作成に失敗しました').waitFor();
    await ctx.shot('create-failed');

    // 今月の回数の上限で断られた (プランの画面を案内する)
    page = await ctx.freshPage();
    await page.route('**/api/jobs', (route) =>
      route.fulfill(
        json(
          {
            error: 'NO_AI_LIMIT_EXCEEDED',
            message: '今月の AI 解析なしの利用回数の上限に達しました',
          },
          429
        )
      )
    );
    await openUpload(page, FREE_USAGE);
    await chooseFile(page, SAMPLE_VIDEO);
    await page.getByText('選択中:').waitFor();
    await start(page).click();
    await page.getByText('今月の AI 解析なしの利用回数の上限に達しました').waitFor();
    await ctx.shot('limit-exceeded');

    // S3 へのアップロードに失敗した (1 本の PUT が 403 になる)
    page = await ctx.freshPage();
    await page.route('**/api/jobs', (route) =>
      route.fulfill(
        json({ jobId: JOB_ID, uploadUrl: `${ctx.baseUrl}/__capture/upload`, expiresIn: 3600 }, 201)
      )
    );
    await page.route('**/__capture/upload', (route) => route.fulfill({ status: 403, body: '' }));
    await openUpload(page, FREE_USAGE);
    await chooseFile(page, SAMPLE_VIDEO);
    await page.getByText('選択中:').waitFor();
    await start(page).click();
    await page.getByText('動画ファイルのアップロードに失敗しました').waitFor();
    await ctx.shot('upload-failed');
  },
};

const jobStatus: Scenario = {
  screen: 'job-status',
  async run(ctx) {
    const open = async (page: Page, job: JobResponse, waitFor: string): Promise<void> => {
      await mockJob(page, job);
      await page.goto(`/jobs/${job.jobId}`);
      await ready(page, waitFor);
    };

    // 処理待ち (広告枠が出ている)
    let page = await ctx.freshPage();
    await mockAdPlaying(page);
    await open(page, PENDING_JOB, '処理待ち');
    await page.locator('video').waitFor();
    await ctx.shot('pending');

    // 解析中。モーション・音量・文字起こしの進み具合を出す
    page = await ctx.freshPage();
    await mockAdPlaying(page);
    await open(page, ANALYZING_JOB, '文字起こし');
    await ctx.shot('analyzing');

    // 文字起こしが失敗してスキップされた
    page = await ctx.freshPage();
    await mockAdPlaying(page);
    await open(page, SKIPPED_AI_JOB, '（スキップ）');
    await ctx.shot('ai-skipped');

    // クリップを切り出している最中 (解析の内訳は出ず、段階の名前だけを出す)
    page = await ctx.freshPage();
    await mockAdPlaying(page);
    await open(page, CLIPPING_JOB, '分割中');
    await ctx.shot('clipping');

    // 処理が終わったが、広告が終わっていない (「見どころを確認する」はまだ出ない)
    page = await ctx.freshPage();
    await mockAdPlaying(page);
    await open(page, COMPLETED_JOB, '処理完了');
    await page.locator('video').waitFor();
    await ctx.shot('completed-ad-playing');

    // 処理が終わり、広告も終わった (広告の読み込みに失敗した場合も同じ)
    page = await ctx.freshPage();
    await mockAdBlocked(page);
    await open(page, COMPLETED_JOB, '見どころを確認する');
    await ctx.shot('completed');

    // 失敗 (広告は出さない)
    page = await ctx.freshPage();
    await mockAdPlaying(page);
    await open(page, FAILED_JOB, '再アップロードする');
    await ctx.shot('failed');

    // 指定したジョブがない
    page = await ctx.freshPage();
    await mockAdBlocked(page);
    await page.route(`**/api/jobs/${MISSING_JOB_ID}`, (route) =>
      route.fulfill(
        json({ error: 'JOB_NOT_FOUND', message: '指定されたジョブが見つかりません' }, 404)
      )
    );
    await page.goto(`/jobs/${MISSING_JOB_ID}`);
    await ready(page, '指定されたジョブが見つかりません');
    await ctx.shot('not-found');

    // 取得に失敗した
    page = await ctx.freshPage();
    await mockAdBlocked(page);
    await page.route(`**/api/jobs/${JOB_ID}`, (route) =>
      route.fulfill(json({ error: 'INTERNAL_SERVER_ERROR' }, 500))
    );
    await page.goto(`/jobs/${JOB_ID}`);
    await ready(page, 'ジョブ情報の取得に失敗しました');
    await ctx.shot('fetch-error');

    // 読み込み中 (取得の応答が返らない)
    page = await ctx.freshPage();
    await mockAdBlocked(page);
    await page.route(`**/api/jobs/${JOB_ID}`, () => new Promise(() => undefined));
    await page.goto(`/jobs/${JOB_ID}`);
    await ready(page, 'ステータスを確認しています');
    await ctx.shot('loading');
  },
};

/** 動画が最後まで読めるのを待つ。読めると、読み込み中の表示 (回転する輪) が消える */
async function waitForClipLoaded(page: Page): Promise<void> {
  await page.waitForFunction(
    () => (document.querySelector('video') as HTMLVideoElement | null)?.readyState === 4
  );
}

/** 見どころ確認画面が呼ぶ API を、指定した見どころの一覧で受ける */
async function mockHighlightsApi(
  page: Page,
  options: {
    job?: JobResponse;
    highlights?: HighlightResponse[];
    listStatus?: number;
    download?: 'pending';
  } = {}
): Promise<void> {
  const { job = COMPLETED_JOB, highlights = HIGHLIGHTS, listStatus = 200 } = options;
  await mockJob(page, job);
  await page.route(`**/api/jobs/${job.jobId}/highlights/recover`, (route) =>
    route.fulfill(json({ recoveredHighlightIds: [] }))
  );
  await page.route(`**/api/jobs/${job.jobId}/highlights`, (route) =>
    listStatus === 200
      ? route.fulfill(json({ highlights }))
      : route.fulfill(
          json(
            { error: 'INTERNAL_SERVER_ERROR', message: '見どころ一覧の取得に失敗しました' },
            listStatus
          )
        )
  );
  await page.route(`**/api/jobs/${job.jobId}/transcript`, (route) =>
    route.fulfill(json({ segments: TRANSCRIPT_SEGMENTS }))
  );
  await page.route('https://clips.example.test/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'video/webm',
      body: Buffer.from(SAMPLE_CLIP_WEBM_BASE64, 'base64'),
    })
  );
  if (options.download === 'pending') {
    // ZIP の作成が終わらない。POST は受け付け、確認 (GET) は作成中のままにする
    await page.route(`**/api/jobs/${job.jobId}/download`, (route) =>
      route.fulfill(json({ status: 'PROCESSING' }, 202))
    );
  }
}

const highlights: Scenario = {
  screen: 'highlights',
  async run(ctx) {
    const open = async (page: Page): Promise<void> => {
      await page.goto(`/jobs/${JOB_ID}/highlights`);
      await ready(page, '採用中の見どころ');
    };
    const selectRow = (page: Page, order: number) => page.getByText(`#${order}`, { exact: true });

    // 通常表示 (見どころを選ぶ前)
    let page = await ctx.freshPage();
    await mockHighlightsApi(page);
    await open(page);
    await ctx.shot('default');

    // 見どころを選んだ (プレビュー、文字起こし、採否、開始・終了)
    page = await ctx.freshPage();
    await mockHighlightsApi(page);
    await open(page);
    await selectRow(page, SELECTED_HIGHLIGHT_ORDER).click();
    await page.locator('video').waitFor();
    await page.getByText('ギリギリ避けた').waitFor();
    await waitForClipLoaded(page);
    await ctx.shot('selected', { settleMs: 1500 });

    // 列設定から「抽出根拠」の列を足した
    page = await ctx.freshPage();
    await mockHighlightsApi(page);
    await open(page);
    await page.getByRole('button', { name: '列設定' }).click();
    await page.getByLabel('抽出根拠').check();
    // ポップオーバーが開いている間、背後の表はアクセシビリティの木から外れるため、ロールでは探せない
    await page
      .locator('td')
      .filter({ hasText: /^感情$/ })
      .first()
      .waitFor();
    await ctx.shot('column-settings');

    // 終了より後の開始時刻を入れた
    page = await ctx.freshPage();
    await mockHighlightsApi(page);
    await open(page);
    await selectRow(page, SELECTED_HIGHLIGHT_ORDER).click();
    await waitForClipLoaded(page);
    await page.getByRole('textbox', { name: '開始' }).fill('9:30');
    await page.getByRole('textbox', { name: '開始' }).blur();
    await page.getByText('開始時刻は終了時刻より小さくしてください').waitFor();
    // 警告が出て画面の配置が動くと、読み込み済みのプレビューに回転する輪が出たままになる。
    // 別の見どころを選んで戻し、警告を残したまま動画を読み直す
    await selectRow(page, 4).click();
    await selectRow(page, SELECTED_HIGHLIGHT_ORDER).click();
    await waitForClipLoaded(page);
    await ctx.shot('range-invalid', { settleMs: 1500 });

    // クリップを作り直している最中 (入力とリトライを止め、生成済みの件数を出す)
    page = await ctx.freshPage();
    await mockHighlightsApi(page, { highlights: REGENERATING_HIGHLIGHTS });
    await open(page);
    await selectRow(page, SELECTED_HIGHLIGHT_ORDER).click();
    await page.getByText('クリップ生成中...').waitFor();
    await ctx.shot('regenerating');

    // 作り直しに失敗した (リトライを出し、採用中なので ZIP のダウンロードを止める)
    page = await ctx.freshPage();
    await mockHighlightsApi(page, { highlights: FAILED_CLIP_HIGHLIGHTS });
    await open(page);
    await selectRow(page, SELECTED_HIGHLIGHT_ORDER).click();
    await page.getByText('クリップ生成に失敗しました').waitFor();
    await ctx.shot('clip-failed');

    // ZIP を準備している (作成が終わらない)
    page = await ctx.freshPage();
    await mockHighlightsApi(page, { download: 'pending' });
    await open(page);
    await page.getByRole('button', { name: 'ZIP ダウンロード' }).click();
    // 実行中は文言が隠れてスピナーが出るため、実行中の印で待つ
    await page.locator('button[aria-busy="true"]').waitFor();
    await ctx.shot('downloading');

    // 見どころが 0 件
    page = await ctx.freshPage();
    await mockHighlightsApi(page, { highlights: [] });
    await page.goto(`/jobs/${JOB_ID}/highlights`);
    await ready(page, '見どころが検出されませんでした');
    await ctx.shot('empty');

    // 一覧の取得に失敗した
    page = await ctx.freshPage();
    await mockHighlightsApi(page, { listStatus: 500 });
    await page.goto(`/jobs/${JOB_ID}/highlights`);
    await ready(page, '見どころ一覧の取得に失敗しました');
    await ctx.shot('load-failed');

    // 処理がまだ終わっていない (一覧は取らず、処理状況の画面へ案内する)
    page = await ctx.freshPage();
    await mockHighlightsApi(page, { job: ANALYZING_JOB });
    await page.goto(`/jobs/${JOB_ID}/highlights`);
    await ready(page, 'まだ処理が終わっていません');
    await ctx.shot('job-in-progress');

    // 処理に失敗した
    page = await ctx.freshPage();
    await mockHighlightsApi(page, { job: FAILED_JOB });
    await page.goto(`/jobs/${JOB_ID}/highlights`);
    await ready(page, '処理に失敗しました');
    await ctx.shot('job-failed');

    // 指定したジョブがない
    page = await ctx.freshPage();
    await page.route(`**/api/jobs/${MISSING_JOB_ID}`, (route) =>
      route.fulfill(
        json({ error: 'JOB_NOT_FOUND', message: '指定されたジョブが見つかりません' }, 404)
      )
    );
    await page.goto(`/jobs/${MISSING_JOB_ID}/highlights`);
    await ready(page, '指定されたジョブが見つかりません');
    await ctx.shot('job-not-found');
  },
};

const tokushoho: Scenario = {
  screen: 'tokushoho',
  async run(ctx) {
    const page = await ctx.freshPage();
    await page.goto('/legal/tokushoho');
    await ready(page, '販売事業者');
    await ctx.shot('default');
  },
};

export const quickClip: ServiceCapture = {
  service: 'quick-clip',
  // 要件が PC (デスクトップ) だけを対象にしており、スマートフォンには対応しない
  devices: ['desktop'],
  server: {
    cwd: 'services/quick-clip/web',
    build: ['npm', 'run', 'build'],
    command: ['npm', 'run', 'start', '--'],
    port: 3401,
    healthPath: '/api/health',
    requiredBuilds: [
      'libs/ui/dist',
      'libs/nextjs/dist',
      'libs/aws/dist',
      'libs/common/dist',
      'libs/browser/dist',
      'services/quick-clip/core/dist',
    ],
    // E2E の環境変数ファイルはなく、AWS にはつながない。広告の URL はビルドに埋め込まれるため、ここで決める
    // (配信先には実際につながず、IMA SDK を撮影の中で差し替える)
    extraEnv: {
      NEXT_PUBLIC_VAST_TAG_URL: 'https://ads.example.test/vast',
      NEXT_PUBLIC_AUTH_URL: 'https://auth.example.test',
      APP_VERSION: '1.0.0',
    },
  },
  // 認証もロールもなく、ログインしなくても使える
  defaultRoles: [],
  fixedTime: '2026-02-28T01:30:00Z',
  scenarios: [upload, jobStatus, highlights, tokushoho],
};
