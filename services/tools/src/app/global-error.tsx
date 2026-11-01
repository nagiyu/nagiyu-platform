'use client';

import { useEffect } from 'react';
import { GlobalErrorView } from '@nagiyu/ui';
import '@nagiyu/ui/tokens.css';
import '@nagiyu/ui/base.css';
import './globals.css';

/**
 * ルートレイアウト自身で発生した例外のフォールバック画面。
 *
 * ルートレイアウトごと置き換わり、レイアウトの CSS 読み込みも引き継がれないため、ここで読み込み直す。
 * GlobalErrorView は例外の内容を表示しないため、調査用にここで console.error へ出力する。
 */
export default function GlobalErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <GlobalErrorView onRetry={retry} />;
}
