'use client';

import { useEffect } from 'react';
import { ErrorView } from '@nagiyu/ui';

/**
 * レイアウト配下の画面で発生した例外のフォールバック画面。
 *
 * ErrorView は例外の内容を表示しないため、調査用にここで console.error へ出力する。
 */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <ErrorView onRetry={retry} />;
}
