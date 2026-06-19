'use client';

import { Box, Container, Typography } from '@mui/material';

import Button from '../Button';
import { buildRefreshUrl } from '../../utils/auth';
import { buildSignOutUrl } from '../../utils/auth';

/**
 * AccessDeniedView に表示するテキストの定数。
 *
 * 表示文言を一箇所に集約して変更を容易にする。
 */
export const ACCESS_DENIED_VIEW_MESSAGES = {
  DEFAULT_TITLE: 'アクセス権限がありません',
  DEFAULT_DESCRIPTION:
    'この機能を利用する権限がありません。管理者の承認後、下のボタンでアクセスを更新してください。',
  REFRESH_BUTTON: 'アクセスを更新',
  SIGN_OUT_BUTTON: '再ログイン',
} as const;

/**
 * AccessDeniedView のプロパティ。
 */
export interface AccessDeniedViewProps {
  /**
   * auth サービスのベース URL（例: "https://auth.nagiyu.com"）
   */
  authUrl: string;
  /**
   * 更新・再ログイン後のリダイレクト先 URL。
   * 未指定時は callbackUrl クエリパラメータを付与しない。
   */
  callbackUrl?: string;
  /**
   * 画面タイトル。デフォルト: "アクセス権限がありません"
   */
  title?: string;
  /**
   * 説明文。デフォルト: "この機能を利用する権限がありません。管理者の承認後、下のボタンでアクセスを更新してください。"
   */
  description?: string;
  /**
   * 「アクセスを更新」ボタン押下時の遷移処理。
   * デフォルトは `window.location.assign(buildRefreshUrl(authUrl, callbackUrl))`。
   * テストや特殊なナビゲーション要件がある場合に上書き可能。
   */
  onRefresh?: (url: string) => void;
  /**
   * 「再ログイン」ボタン押下時の遷移処理。
   * デフォルトは `window.location.assign(buildSignOutUrl(authUrl, callbackUrl))`。
   * テストや特殊なナビゲーション要件がある場合に上書き可能。
   */
  onSignOut?: (url: string) => void;
}

/**
 * アクセス権限なし（403）時の導線付き画面コンポーネント。
 *
 * - 「アクセスを更新」ボタン: auth サービスの /refresh エンドポイントへリダイレクトし、
 *   セッションを更新後に callbackUrl へ戻る（管理者によるロール付与後の利用を想定）。
 * - 「再ログイン」ボタン: auth サービスのサインアウトエンドポイントへリダイレクトし、
 *   再ログインを促す。
 *
 * libs 内のため、パスエイリアス（@/）は使用せず相対 import のみを使用する。
 */
export default function AccessDeniedView({
  authUrl,
  callbackUrl,
  title = ACCESS_DENIED_VIEW_MESSAGES.DEFAULT_TITLE,
  description = ACCESS_DENIED_VIEW_MESSAGES.DEFAULT_DESCRIPTION,
  onRefresh,
  onSignOut,
}: AccessDeniedViewProps) {
  const handleRefresh = () => {
    const url = buildRefreshUrl(authUrl, callbackUrl);
    if (onRefresh) {
      onRefresh(url);
    } else {
      window.location.assign(url);
    }
  };

  const handleSignOut = () => {
    const url = buildSignOutUrl(authUrl, callbackUrl);
    if (onSignOut) {
      onSignOut(url);
    } else {
      window.location.assign(url);
    }
  };

  return (
    <Container maxWidth="sm">
      <Box
        role="main"
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
          <Button
            variant="solid"
            color="primary"
            onClick={handleRefresh}
            aria-label={ACCESS_DENIED_VIEW_MESSAGES.REFRESH_BUTTON}
          >
            {ACCESS_DENIED_VIEW_MESSAGES.REFRESH_BUTTON}
          </Button>
          <Button
            variant="outline"
            color="neutral"
            onClick={handleSignOut}
            aria-label={ACCESS_DENIED_VIEW_MESSAGES.SIGN_OUT_BUTTON}
          >
            {ACCESS_DENIED_VIEW_MESSAGES.SIGN_OUT_BUTTON}
          </Button>
        </Box>
      </Box>
    </Container>
  );
}
