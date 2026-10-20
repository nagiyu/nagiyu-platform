'use client';

import { Box, CircularProgress, Typography } from '@mui/material';

/**
 * ローディング状態コンポーネントのプロパティ
 */
export interface LoadingStateProps {
  /**
   * ローディングメッセージ
   */
  message?: string;
  /**
   * 最小高さ（レスポンシブ対応）。page の既定は 400、inline の既定は指定なし
   */
  minHeight?: number | string | { xs?: number; sm?: number; md?: number; lg?: number; xl?: number };
  /**
   * サイズ（CircularProgressのサイズ）
   */
  size?: number;
  /**
   * 表示形態。page は画面全体の読み込み、inline は一覧や表の中に置く読み込み
   */
  variant?: 'page' | 'inline';
  /**
   * E2E テストなどから root 要素を特定するための ID
   */
  'data-testid'?: string;
}

/**
 * ローディング状態コンポーネント
 *
 * 統一されたローディング表示を提供します。
 * アクセシビリティ対応として、role="status"とaria-live="polite"を設定しています。
 * 入れ子の live region は二重に読み上げられるため、内側の要素には aria-live を付けません。
 * inline ではメッセージを表示せず、読み上げ用の aria-label にだけ使います。
 */
export default function LoadingState({
  message = '読み込み中...',
  minHeight,
  size = 40,
  variant = 'page',
  'data-testid': dataTestId,
}: LoadingStateProps) {
  const isInline = variant === 'inline';
  // inline は高さを固定しないが、呼び出し側が明示した minHeight は尊重する
  const resolvedMinHeight = minHeight ?? (isInline ? undefined : 400);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        ...(isInline ? { py: 4 } : {}),
        ...(resolvedMinHeight !== undefined ? { minHeight: resolvedMinHeight } : {}),
      }}
      data-testid={dataTestId}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <CircularProgress size={size} aria-label={message} />
      {!isInline && message && (
        <Typography variant="body1" color="text.secondary" sx={{ mt: 2 }}>
          {message}
        </Typography>
      )}
    </Box>
  );
}
