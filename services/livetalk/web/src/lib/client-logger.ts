import { buildErrorContext } from '@nagiyu/common';
import type { ErrorSeverity } from '@nagiyu/common';

export type ClientSeverity = Extract<ErrorSeverity, 'warning' | 'error' | 'critical'>;

export interface ClientErrorContext {
  screen?: string;
  audioContextState?: string;
  sentenceReceived?: number;
  streamDone?: boolean;
  filename?: string;
  lineno?: number;
  [key: string]: unknown;
}

function collectBaseContext(): Record<string, unknown> {
  /* istanbul ignore next */
  if (typeof window === 'undefined') return {};

  const standalone =
    (typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches) ||
    (window.navigator as { standalone?: boolean }).standalone === true;

  return {
    userAgent: window.navigator.userAgent,
    standalone,
  };
}

/** 例外の値を持つ報告で渡すオプション */
export interface ReportClientErrorOptions {
  /** 例外の値。キー自体を渡したときだけ errorName / errorMessage / errorStack を context に付ける */
  error?: unknown;
}

/**
 * 画面側の例外をサーバーへ報告する。
 *
 * 例外の項目 (errorName / errorMessage / errorStack) はサーバー側と同じ buildErrorContext で組み立てる。
 * 呼び出し元の context で上書きされて項目がばらつかないよう、最後に重ねる。
 * 例外の値を持たない報告 (HTTP ステータスでの失敗など) は options を渡さず、項目を付けない。
 */
export function reportClientError(
  severity: ClientSeverity,
  title: string,
  message: string,
  context?: ClientErrorContext,
  options?: ReportClientErrorOptions
): void {
  /* istanbul ignore next */
  if (typeof window === 'undefined') return;

  const payload = {
    severity,
    title,
    message,
    context: {
      ...collectBaseContext(),
      ...context,
      ...(options && 'error' in options ? buildErrorContext(options.error) : {}),
    },
    occurredAt: new Date().toISOString(),
  };

  fetch('/api/client-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {});
}
