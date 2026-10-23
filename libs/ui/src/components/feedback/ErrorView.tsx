'use client';

import { Box, Container, Typography } from '@mui/material';

import Button from '../Button';

/**
 * ErrorView に表示するテキストの定数。
 *
 * 表示文言を一箇所に集約して変更を容易にする。
 */
export const ERROR_VIEW_MESSAGES = {
  DEFAULT_TITLE: 'エラーが発生しました',
  DEFAULT_DESCRIPTION:
    '画面の表示中に問題が発生しました。もう一度お試しいただくか、トップページへ戻ってください。',
  RETRY_BUTTON: 'もう一度試す',
  HOME_BUTTON: 'トップページへ戻る',
} as const;

/**
 * ErrorView のプロパティ。
 */
export interface ErrorViewProps {
  /**
   * 「もう一度試す」ボタン押下時の処理。Next.js の error.tsx が受け取る `retry` を渡す想定。
   * 未指定の場合は再試行ボタンを表示しない。
   */
  onRetry?: () => void;
  /**
   * 画面タイトル。デフォルト: "エラーが発生しました"
   */
  title?: string;
  /**
   * 説明文。デフォルト: "画面の表示中に問題が発生しました。もう一度お試しいただくか、トップページへ戻ってください。"
   */
  description?: string;
  /**
   * 「トップページへ戻る」の遷移先。デフォルト: "/"
   */
  homeHref?: string;
}

/**
 * 画面表示中のエラー時 (error.tsx 向け) の画面コンポーネント。
 *
 * - エラーの message / digest は表示しない。本番では Next.js が詳細を伏せるうえ、利用者に見せる情報ではないため。
 * - ログ出力もこの部品では行わない。出力は各サービスの error.tsx 側の責務とする。
 * - 各サービスのレイアウトがすでに main ランドマークを持ち、この画面はその内側に描かれるため、
 *   `role="main"` は付けない。
 * - 強調ボタン (solid / primary) は常に画面で最も取るべき操作に 1 つだけ付ける。
 *   再試行があれば再試行、無ければトップへ戻るが担う。
 *
 * libs 内のため、パスエイリアス（@/）は使用せず相対 import のみを使用する。
 */
export default function ErrorView({
  onRetry,
  title = ERROR_VIEW_MESSAGES.DEFAULT_TITLE,
  description = ERROR_VIEW_MESSAGES.DEFAULT_DESCRIPTION,
  homeHref = '/',
}: ErrorViewProps) {
  const hasRetry = onRetry !== undefined;

  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 400,
          gap: 3,
          py: 4,
          textAlign: 'center',
        }}
      >
        <Typography variant="h5" component="h1">
          {title}
        </Typography>
        <Typography variant="body1" color="text.secondary">
          {description}
        </Typography>
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            width: '100%',
            maxWidth: 320,
          }}
        >
          {hasRetry && (
            <Button variant="solid" color="primary" onClick={onRetry}>
              {ERROR_VIEW_MESSAGES.RETRY_BUTTON}
            </Button>
          )}
          <Button
            asChild
            variant={hasRetry ? 'outline' : 'solid'}
            color={hasRetry ? 'neutral' : 'primary'}
          >
            <a href={homeHref}>{ERROR_VIEW_MESSAGES.HOME_BUTTON}</a>
          </Button>
        </Box>
      </Box>
    </Container>
  );
}
