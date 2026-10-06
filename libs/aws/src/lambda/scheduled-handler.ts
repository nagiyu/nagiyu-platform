import { logger, toErrorMessage } from '@nagiyu/common';
import { reportErrorEvent } from '../error-events/report.js';

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

export interface ScheduledHandlerErrorOptions {
  /** エラー報告のタイトル。未指定なら createScheduledHandler の errorTitle を使う */
  title?: string;
  /** エラー報告の context にマージする追加情報（失敗した対象の ID 等） */
  context?: Record<string, unknown>;
}

/**
 * 部分失敗など、エラー報告のタイトルや context を呼び出し側で指定したい失敗に使う例外。
 *
 * 骨格は報告を 1 回に保つため、fn 内で reportErrorEvent を直接呼ぶ代わりに
 * この例外を投げて、報告内容だけを上書きさせる。
 */
export class ScheduledHandlerError extends Error {
  public readonly title?: string;
  public readonly context?: Record<string, unknown>;

  constructor(message: string, options: ScheduledHandlerErrorOptions = {}) {
    super(message);
    this.name = 'ScheduledHandlerError';
    this.title = options.title;
    this.context = options.context;
  }
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

    try {
      return await fn(event);
    } catch (error) {
      const override = error instanceof ScheduledHandlerError ? error : undefined;

      logger.error(`${prefix} ${LOG_MESSAGES.FAILED}`, {
        ...context,
        error: toErrorMessage(error),
      });
      // 報告は補助的手段で reportErrorEvent は例外を投げないため、元の例外の再送出を妨げない
      await reportErrorEvent({
        serviceId: options.serviceId,
        severity: 'error',
        title: override?.title ?? options.errorTitle,
        message: toErrorMessage(error),
        context: {
          ...context,
          ...override?.context,
          errorName: error instanceof Error ? error.name : typeof error,
          errorMessage: toErrorMessage(error),
          errorStack: error instanceof Error ? error.stack : undefined,
        },
      });
      throw error;
    }
  };
}
