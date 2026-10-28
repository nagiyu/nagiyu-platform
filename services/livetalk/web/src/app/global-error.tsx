'use client';

import { useEffect } from 'react';
import { GlobalErrorView } from '@nagiyu/ui';
import '@nagiyu/ui/tokens.css';
import '@nagiyu/ui/base.css';
import { reportClientError } from '@/lib/client-logger';

/**
 * ルートレイアウト自身で発生した例外のフォールバック画面。
 *
 * ルートレイアウトごと置き換わり、レイアウトの CSS 読み込みも引き継がれないため、ここで読み込み直す。
 * GlobalErrorView は例外の内容を表示しないため、調査用に console.error へ出力する。
 * あわせて ClientErrorReporter と同じ経路 (reportClientError) でサーバーへ報告する。
 * エラーバウンダリが捕捉した例外は ClientErrorReporter (window のイベント監視) の対象にならないため。
 */
export default function GlobalErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
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

  return <GlobalErrorView onRetry={retry} />;
}
