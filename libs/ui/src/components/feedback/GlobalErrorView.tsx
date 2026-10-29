'use client';

import { Box } from '@mui/material';

import AppThemeProvider from '../providers/AppThemeProvider';
import ErrorView, { type ErrorViewProps } from './ErrorView';

/**
 * GlobalErrorView のプロパティ。ErrorView のプロパティをそのまま受け取る。
 */
export type GlobalErrorViewProps = ErrorViewProps;

/**
 * ルートレイアウト自身の例外時 (global-error.tsx 向け) の画面コンポーネント。
 *
 * - global-error.tsx はルートレイアウトを置き換えるため、`html` / `body` とテーマをここで用意する。
 *   ヘッダー・フッターは描かない。レイアウトが壊れている前提のため、依存を増やさない。
 * - ErrorView は main ランドマークを持たない設計のため、ここで `main` を与える。
 * - ルートレイアウトの CSS 読み込みも引き継がれないため、呼び出し側の global-error.tsx で必要な CSS を import する。
 * - 文言・ログ出力の方針は ErrorView に従う。
 *
 * libs 内のため、パスエイリアス（@/）は使用せず相対 import のみを使用する。
 */
export default function GlobalErrorView(props: GlobalErrorViewProps) {
  return (
    <html lang="ja">
      <body>
        <AppThemeProvider>
          <Box component="main">
            <ErrorView {...props} />
          </Box>
        </AppThemeProvider>
      </body>
    </html>
  );
}
