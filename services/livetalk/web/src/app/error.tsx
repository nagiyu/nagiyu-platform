'use client';

import { useEffect } from 'react';
import { ErrorView } from '@nagiyu/ui';
import { reportClientError } from '@/lib/client-logger';

/**
 * レイアウト配下の画面で発生した例外のフォールバック画面。
 *
 * ErrorView は例外の内容を表示しないため、調査用に console.error へ出力する。
 * あわせて ClientErrorReporter と同じ経路 (reportClientError) でサーバーへ報告する。
 * エラーバウンダリが捕捉した例外は ClientErrorReporter (window のイベント監視) の対象にならないため。
 */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
    reportClientError(
      'error',
      '画面表示中の例外',
      error instanceof Error ? error.message : String(error),
      {
        screen: 'error-boundary',
        stack: error instanceof Error ? error.stack : undefined,
      }
    );
  }, [error]);

  return <ErrorView onRetry={retry} />;
}
