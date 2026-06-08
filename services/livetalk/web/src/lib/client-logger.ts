import type { ErrorSeverity } from '@nagiyu/common';

export type ClientSeverity = Extract<ErrorSeverity, 'warning' | 'error' | 'critical'>;

export interface ClientErrorContext {
  screen?: string;
  audioContextState?: string;
  sentenceReceived?: number;
  streamDone?: boolean;
  stack?: string;
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

export function reportClientError(
  severity: ClientSeverity,
  title: string,
  message: string,
  context?: ClientErrorContext
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
    },
    occurredAt: new Date().toISOString(),
  };

  fetch('/api/client-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {});
}
