import { logger, toErrorMessage } from '@nagiyu/common';
import { withErrorReporting } from '../error-events/with-error-reporting.js';

/** EventBridge のスケジュールルールから Lambda に渡されるイベント */
export interface ScheduledEvent {
  version: string;
  id: string;
  'detail-type': string;
  source: string;
  account: string;
  time: string;
  region: string;
  resources: string[];
  detail: Record<string, unknown>;
}

/** バッチ Lambda の標準的な戻り値 */
export interface HandlerResponse {
  statusCode: number;
  body: string;
}

export interface ScheduledHandlerOptions<TEvent> {
  /** reportErrorEvent に渡すサービス ID */
  serviceId: string;
  /** ログ接頭辞に使うバッチ名（例: 'notify' → '[notify] バッチ開始'） */
  name: string;
  /** エラー報告のタイトル */
  errorTitle: string;
  /**
   * 開始ログ・失敗ログ・エラー報告の context に入れる情報。
   * 未指定の場合、event が `id` / `time` を持てば eventId / eventTime を使い、持たなければ空。
   */
  getLogContext?: (event: TEvent) => Record<string, unknown>;
}

const LOG_MESSAGES = {
  START: 'バッチ開始',
  FAILED: 'バッチ失敗',
} as const;

/**
 * ScheduledEvent 形でない event（dev-sync 等）でも安全に動くよう、
 * 文字列の id / time が取れる場合のみ既定 context に含める。
 */
function defaultLogContext(event: unknown): Record<string, unknown> {
  if (typeof event !== 'object' || event === null) {
    return {};
  }
  const { id, time } = event as { id?: unknown; time?: unknown };
  const context: Record<string, unknown> = {};
  if (typeof id === 'string') {
    context.eventId = id;
  }
  if (typeof time === 'string') {
    context.eventTime = time;
  }
  return context;
}

/**
 * 定期実行バッチ Lambda の共通骨格を作る。
 *
 * 開始ログ、失敗時のログ出力とエラー報告までを担い、完了ログは統計を持つ fn 側に任せる。
 * 失敗時は元の例外を再送出する。500 を返して正常終了させると Lambda の Errors メトリクスが
 * 増えず、Errors アラーム・DLQ・非同期呼び出しの再試行が効かなくなるため。
 * エラー報告は補助的な手段で reportErrorEvent は例外を投げないので、再送出を妨げない。
 */
export function createScheduledHandler<TEvent = ScheduledEvent, TResult = HandlerResponse>(
  options: ScheduledHandlerOptions<TEvent>,
  fn: (event: TEvent) => Promise<TResult>
): (event: TEvent) => Promise<TResult> {
  const prefix = `[${options.name}]`;

  return async (event: TEvent): Promise<TResult> => {
    const context = options.getLogContext ? options.getLogContext(event) : defaultLogContext(event);

    logger.info(`${prefix} ${LOG_MESSAGES.START}`, context);

    // fn が例外を投げた場合 withErrorReporting が報告後に再送出するため、成功時のみ結果が返る
    const result = await withErrorReporting(
      {
        serviceId: options.serviceId,
        title: options.errorTitle,
        context,
        onError: async (error) => {
          logger.error(`${prefix} ${LOG_MESSAGES.FAILED}`, {
            ...context,
            error: toErrorMessage(error),
          });
        },
      },
      () => fn(event)
    );
    return result as TResult;
  };
}
