import type { Page } from '@playwright/test';
import type { Scenario, ServiceCapture } from './types';
import {
  COMPLETED_JOB,
  FAKE_AWS_PORT,
  FAKE_AWS_URL,
  FAILED_JOB,
  MISSING_JOB_ID,
  PENDING_JOB,
  PROCESSING_JOB,
  clearToggles,
  seedJob,
  setToggles,
} from './codec-converter-data';

/**
 * codec-converter の撮影シナリオ。画面ごとに、カードで紹介する状態を撮る。
 * 状態を足したら、カードの「画面の見た目」にも同じ名前で足す。
 *
 * このサービスにはインメモリ DB の切り替えも E2E 用の環境変数ファイルもなく、E2E は実 AWS を前提にしている。
 * そのため DynamoDB / S3 / Batch を偽の AWS として補助のプロセスで起動し、ジョブの投入と障害の注入はそこへ行う。
 */

const MB = 1024 * 1024;

/** 描画が落ち着くまで待つ。待つ対象のテキストを明示する */
async function ready(page: Page, text: string): Promise<void> {
  await page.getByText(text, { exact: false }).first().waitFor();
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
}

/**
 * アップロード欄にファイルを選んだことにする。
 * 500MB を超える実体を作らずに済むよう、中身は空のまま大きさだけを申告する。
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

const SAMPLE_VIDEO = { name: 'family-trip-2026.mp4', type: 'video/mp4', sizeBytes: 48 * MB };

const upload: Scenario = {
  screen: 'upload',
  async run(ctx) {
    await clearToggles();
    const start = (page: Page) => page.getByRole('button', { name: '変換開始' });

    // 通常表示 (ファイル未選択。「変換開始」は押せない)
    let page = await ctx.freshPage();
    await page.goto('/');
    await ready(page, 'ファイルをドラッグ');
    await ctx.shot('default');

    // ファイルを選び、出力コーデックを AV1 にした
    page = await ctx.freshPage();
    await page.goto('/');
    await ready(page, 'ファイルをドラッグ');
    await chooseFile(page, SAMPLE_VIDEO);
    await page.getByText('選択されたファイル').waitFor();
    await page.getByRole('radio', { name: /AV1/ }).check();
    await ctx.shot('file-selected');

    // MP4 でないファイルを選んだ
    page = await ctx.freshPage();
    await page.goto('/');
    await ready(page, 'ファイルをドラッグ');
    await chooseFile(page, { name: 'notes.txt', type: 'text/plain', sizeBytes: 2048 });
    await page.getByText('MP4ファイルのみアップロード可能です', { exact: true }).last().waitFor();
    await ctx.shot('invalid-type');

    // 500MB を超えるファイルを選んだ
    page = await ctx.freshPage();
    await page.goto('/');
    await ready(page, 'ファイルをドラッグ');
    await chooseFile(page, { name: 'long-movie.mp4', type: 'video/mp4', sizeBytes: 600 * MB });
    await page.getByText('ファイルサイズは500MB以下である必要があります').waitFor();
    await ctx.shot('too-large');

    // アップロード中 (S3 への PUT が終わらない)
    page = await ctx.freshPage();
    await page.route(
      (url) => url.port === String(FAKE_AWS_PORT) && url.pathname.endsWith('/input.mp4'),
      (route) =>
        route.request().method() === 'PUT' ? new Promise(() => undefined) : route.continue()
    );
    await page.goto('/');
    await ready(page, 'ファイルをドラッグ');
    await chooseFile(page, SAMPLE_VIDEO);
    await page.getByText('選択されたファイル').waitFor();
    await start(page).click();
    // 実行中は文言が隠れてスピナーが出るため、実行中の印で待つ
    await page.locator('button[aria-busy="true"]').waitFor();
    await ctx.shot('uploading');

    // ジョブの作成に失敗した (DynamoDB が 500 を返す)
    await setToggles({ ddbFail: true });
    page = await ctx.freshPage();
    await page.goto('/');
    await ready(page, 'ファイルをドラッグ');
    await chooseFile(page, SAMPLE_VIDEO);
    await page.getByText('選択されたファイル').waitFor();
    await start(page).click();
    await page.getByText('ジョブの作成に失敗しました').waitFor();
    await ctx.shot('create-failed');
    await clearToggles();

    // S3 へのアップロードに失敗した
    await setToggles({ s3PutFail: true });
    page = await ctx.freshPage();
    await page.goto('/');
    await ready(page, 'ファイルをドラッグ');
    await chooseFile(page, SAMPLE_VIDEO);
    await page.getByText('選択されたファイル').waitFor();
    await start(page).click();
    await page.getByText('ファイルのアップロードに失敗しました').waitFor();
    await ctx.shot('upload-failed');
    await clearToggles();

    // 投入に失敗した (アップロードしたはずの入力ファイルが S3 に見つからない)
    await setToggles({ s3HeadFail: true });
    page = await ctx.freshPage();
    await page.goto('/');
    await ready(page, 'ファイルをドラッグ');
    await chooseFile(page, SAMPLE_VIDEO);
    await page.getByText('選択されたファイル').waitFor();
    await start(page).click();
    await page.getByText('入力ファイルが見つかりません').waitFor();
    await ctx.shot('submit-failed');
    await clearToggles();
  },
};

const jobDetail: Scenario = {
  screen: 'job-detail',
  async run(ctx) {
    await clearToggles();
    for (const seed of [PENDING_JOB, PROCESSING_JOB, COMPLETED_JOB, FAILED_JOB]) {
      await seedJob(seed);
    }

    // 待機中 (「ステータス確認」を出す)
    let page = await ctx.freshPage();
    await page.goto(`/jobs/${PENDING_JOB.jobId}`);
    await ready(page, '待機中');
    await ctx.shot('pending');

    // 処理中
    page = await ctx.freshPage();
    await page.goto(`/jobs/${PROCESSING_JOB.jobId}`);
    await ready(page, '処理中');
    await ctx.shot('processing');

    // ステータス確認中 (再取得の応答が返らない)
    page = await ctx.freshPage();
    await page.goto(`/jobs/${PROCESSING_JOB.jobId}`);
    await ready(page, '処理中');
    await page.route(`**/api/jobs/${PROCESSING_JOB.jobId}`, () => new Promise(() => undefined));
    await page.getByRole('button', { name: 'ジョブステータスを確認' }).click();
    await page.locator('button[aria-busy="true"]').waitFor();
    await ctx.shot('refreshing');

    // 完了 (「ダウンロード」を出す)
    page = await ctx.freshPage();
    await page.goto(`/jobs/${COMPLETED_JOB.jobId}`);
    await ready(page, '変換が完了しました');
    await ctx.shot('completed');

    // 失敗 (エラー詳細を出す)
    page = await ctx.freshPage();
    await page.goto(`/jobs/${FAILED_JOB.jobId}`);
    await ready(page, 'エラー詳細');
    await ctx.shot('failed');

    // 指定したジョブがない
    page = await ctx.freshPage();
    await page.goto(`/jobs/${MISSING_JOB_ID}`);
    await ready(page, '指定されたジョブが見つかりません');
    await ctx.shot('not-found');

    // 読み込み中 (取得の応答が返らない)
    page = await ctx.freshPage();
    await page.route(`**/api/jobs/${PENDING_JOB.jobId}`, () => new Promise(() => undefined));
    await page.goto(`/jobs/${PENDING_JOB.jobId}`);
    await page.getByText('読み込み中...').waitFor();
    await ctx.shot('loading');

    // 取得に失敗した (DynamoDB が 500 を返す)
    await setToggles({ ddbFail: true });
    page = await ctx.freshPage();
    await page.goto(`/jobs/${PENDING_JOB.jobId}`);
    await ready(page, 'ジョブ情報の取得に失敗しました');
    await ctx.shot('fetch-error');
    await clearToggles();
  },
};

export const codecConverter: ServiceCapture = {
  service: 'codec-converter',
  // 要件はスマホファーストか PC かを一つに決めておらず、レイアウトは両方に対応する
  devices: ['mobile', 'desktop'],
  server: {
    cwd: 'services/codec-converter/web',
    build: ['npm', 'run', 'build'],
    command: ['npm', 'run', 'start', '--'],
    port: 3300,
    healthPath: '/api/health',
    requiredBuilds: [
      'libs/ui/dist',
      'libs/nextjs/dist',
      'libs/aws/dist',
      'libs/common/dist',
      'libs/browser/dist',
      'services/codec-converter/core/dist',
    ],
    // DynamoDB / S3 / Batch の向き先を、実際の AWS ではなく偽の AWS にする。鍵はダミー
    extraEnv: {
      AWS_ENDPOINT_URL: FAKE_AWS_URL,
      AWS_REGION: 'us-east-1',
      AWS_ACCESS_KEY_ID: 'capture',
      AWS_SECRET_ACCESS_KEY: 'capture',
      AWS_SESSION_TOKEN: '',
      AWS_PROFILE: '',
      DYNAMODB_TABLE_NAME: 'codec-converter-capture',
      S3_BUCKET: 'codec-converter-capture',
      BATCH_JOB_QUEUE: 'codec-converter-capture',
      BATCH_JOB_DEFINITION_PREFIX: 'codec-converter-capture',
      APP_VERSION: '1.0.0',
    },
    companions: [
      {
        command: [
          'node',
          '.claude/skills/exploratory-test/scripts/fake-aws/codec-converter-fake-aws.js',
        ],
        env: { FAKE_PORT: String(FAKE_AWS_PORT) },
        healthUrl: `${FAKE_AWS_URL}/__admin/items`,
        requiredFiles: [
          '.claude/skills/exploratory-test/scripts/fake-aws/codec-converter-fake-aws.js',
        ],
      },
    ],
  },
  // 認証もロールもないサービス
  defaultRoles: [],
  fixedTime: '2026-02-28T01:30:00Z',
  scenarios: [upload, jobDetail],
};
