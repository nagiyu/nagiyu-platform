/**
 * admin の撮影に使うデータ。
 * エラー履歴は偽の DynamoDB に投入する。時刻は実行日に左右されないよう固定する。
 */

/** 偽の DynamoDB を待ち受けるポート */
export const FAKE_DDB_PORT = 43299;
export const FAKE_DDB_URL = `http://127.0.0.1:${FAKE_DDB_PORT}`;
/** admin の web が読むテーブル名。環境変数 `ERROR_EVENTS_TABLE_NAME` と揃える */
export const ERROR_EVENTS_TABLE = 'errors-capture';

export type Severity = 'info' | 'warning' | 'error' | 'critical';
export type Source = 'application' | 'cloudwatch-alarm' | 'batch-event' | 'manual';

export interface SeedEvent {
  eventId: string;
  serviceId: string;
  source: Source;
  severity: Severity;
  title: string;
  message: string;
  context: string;
  /** epoch ミリ秒 */
  occurredAt: number;
}

const s = (value: string) => ({ S: value });
const n = (value: number) => ({ N: String(value) });

/** error-events テーブルの 1 件分の項目 (キーの作りは libs/aws の ErrorEventMapper と同じ) */
function toItem(event: SeedEvent): Record<string, unknown> {
  const sortKey = `OCCURRED#${new Date(event.occurredAt).toISOString()}#${event.eventId}`;
  return {
    PK: s(`ERROR_EVENT#${event.serviceId}`),
    SK: s(sortKey),
    Type: s('ErrorEvent'),
    GSI1PK: s('ERROR_EVENT_ALL'),
    GSI1SK: s(sortKey),
    EventID: s(event.eventId),
    ServiceID: s(event.serviceId),
    Source: s(event.source),
    Severity: s(event.severity),
    Title: s(event.title),
    Message: s(event.message),
    Context: s(event.context),
    OccurredAt: n(event.occurredAt),
    CreatedAt: n(event.occurredAt),
    UpdatedAt: n(event.occurredAt),
  };
}

/** 偽の DynamoDB を空にして、`events` を投入する */
export async function seedErrorEvents(events: SeedEvent[]): Promise<void> {
  const reset = await fetch(`${FAKE_DDB_URL}/__reset`, { method: 'POST' });
  if (!reset.ok) throw new Error(`偽の DynamoDB の初期化に失敗しました: ${reset.status}`);
  if (events.length === 0) return;
  const seed = await fetch(`${FAKE_DDB_URL}/__seed`, {
    method: 'POST',
    body: JSON.stringify({ table: ERROR_EVENTS_TABLE, items: events.map(toItem) }),
  });
  if (!seed.ok) throw new Error(`エラー履歴の投入に失敗しました: ${seed.status}`);
}

const at = (iso: string): number => new Date(iso).getTime();

const ALARM_MESSAGE = JSON.stringify({
  AlarmName: 'livetalk-batch-acquire-errors-dev',
  AlarmDescription: 'acquire Lambda の例外発生',
  NewStateValue: 'ALARM',
  NewStateReason:
    'Threshold Crossed: 1 datapoint [1.0 (28/02/26 01:10:00)] was greater than or equal to the threshold (1.0).',
  StateChangeTime: '2026-02-28T01:15:04.000+0000',
  Region: 'US East (N. Virginia)',
});

const BATCH_MESSAGE = JSON.stringify({
  'detail-type': 'Batch Job State Change',
  source: 'aws.batch',
  time: '2026-02-27T22:40:31Z',
  detail: {
    jobName: 'quick-clip-extract-dev',
    status: 'FAILED',
    statusReason: 'Essential container in task exited',
    jobQueue: 'quick-clip-queue-dev',
  },
});

/** 詳細画面の撮影に使う 1 件 (CloudWatch Alarm 由来) */
export const DETAIL_EVENT: SeedEvent = {
  eventId: '5c0f3a52-3a9e-4a52-8d9e-6f3a1c2b7e01',
  serviceId: 'livetalk-batch',
  source: 'cloudwatch-alarm',
  severity: 'error',
  title: 'livetalk-batch-acquire-errors-dev (ALARM)',
  message:
    'Threshold Crossed: 1 datapoint [1.0 (28/02/26 01:10:00)] was greater than or equal to the threshold (1.0).',
  context: ALARM_MESSAGE,
  occurredAt: at('2026-02-28T01:15:04Z'),
};

/** 一覧の撮影に使う、重大度・発生元・サービスが散らばった 7 件 */
export const LIST_EVENTS: SeedEvent[] = [
  DETAIL_EVENT,
  {
    eventId: '7a1b9c34-0d52-4b8e-a6c1-2e4f5a6b7c02',
    serviceId: 'livetalk',
    source: 'application',
    severity: 'error',
    title: '勉強バッチ: 致命的エラー',
    message:
      'OpenAI API の呼び出しに失敗しました。リクエストがタイムアウトしました。再試行の上限に達したため、この回の勉強を中断します。',
    context: JSON.stringify({ attempt: 3, topic: 'ニュース', durationMs: 30012 }),
    occurredAt: at('2026-02-28T01:12:40Z'),
  },
  {
    eventId: '9d2e4f61-8b3a-4c7d-b5e2-1a3c5e7f9d03',
    serviceId: 'stock-tracker-batch',
    source: 'application',
    severity: 'warning',
    title: 'サマリーバッチ: ティッカー日足データ取得失敗',
    message: 'TradingView から日足を取得できませんでした',
    context: JSON.stringify({ exchangeId: 'ex-nasdaq', tickerId: 'NASDAQ:AAPL' }),
    occurredAt: at('2026-02-28T00:05:12Z'),
  },
  {
    eventId: 'b3f5a7c9-1e2d-4f6a-8b0c-3d5e7f9a1b04',
    serviceId: 'stock-tracker-batch',
    source: 'application',
    severity: 'error',
    title: 'サマリーバッチ: 取引所サマリー処理失敗',
    message: 'ティッカー一覧の取得に失敗しました',
    context: JSON.stringify({ exchangeId: 'ex-tse' }),
    occurredAt: at('2026-02-27T23:05:09Z'),
  },
  {
    eventId: 'c4a6b8d0-2f3e-4a7b-9c1d-4e6f8a0b2c05',
    serviceId: 'quick-clip',
    source: 'batch-event',
    severity: 'critical',
    title: 'AWS Batch ジョブ失敗: quick-clip-extract-dev',
    message: 'Essential container in task exited',
    context: BATCH_MESSAGE,
    occurredAt: at('2026-02-27T22:40:31Z'),
  },
  {
    eventId: 'd5b7c9e1-3a4f-4b8c-8d2e-5f7a9b1c3d06',
    serviceId: 'admin',
    source: 'application',
    severity: 'error',
    title: 'エラー一覧取得 API の実行に失敗しました',
    message: 'ERROR_EVENTS_TABLE_NAME が設定されていません',
    context: JSON.stringify({ method: 'GET', pathname: '/api/errors' }),
    occurredAt: at('2026-02-27T15:20:00Z'),
  },
  {
    eventId: 'e6c8d0f2-4b5a-4c9d-9e3f-6a8b0c2d4e07',
    serviceId: 'livetalk-batch',
    source: 'manual',
    severity: 'info',
    title: '手動で記録したメモ',
    message: '通知の動作確認のため、手動で記録しました',
    context: '{}',
    occurredAt: at('2026-02-26T03:00:00Z'),
  },
];

/** 次のページの撮影に使う、50 件を超える件数の履歴 */
export const MANY_EVENTS: SeedEvent[] = Array.from({ length: 56 }, (_, i) => ({
  eventId: `f7d9e1a3-5c6b-4d0e-8f4a-${String(i).padStart(12, '0')}`,
  serviceId: i % 2 === 0 ? 'livetalk-batch' : 'stock-tracker-batch',
  source: 'application',
  severity: i % 3 === 0 ? 'error' : 'warning',
  title: i % 2 === 0 ? '通知バッチ: 致命的エラー' : 'サマリーバッチ: 致命的エラー',
  message: `処理に失敗しました (${i + 1} 件目)`,
  context: '{}',
  // 新しいものから 10 分ずつさかのぼる
  occurredAt: at('2026-02-28T01:00:00Z') - i * 10 * 60 * 1000,
}));

/** 解釈できない項目 (severity が範囲外)。一覧の取得が例外になり、エラー画面が出る */
export const BROKEN_EVENT: SeedEvent = {
  eventId: '0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d',
  serviceId: 'auth',
  source: 'application',
  severity: 'fatal' as Severity,
  title: '範囲外の重大度',
  message: '一覧に出せない項目',
  context: '{}',
  occurredAt: at('2026-02-28T01:00:00Z'),
};
