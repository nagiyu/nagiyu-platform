'use client';

import { Box, Container, Typography } from '@mui/material';

import Button from '../Button';

/**
 * NotFoundView に表示するテキストの定数。
 *
 * 表示文言を一箇所に集約して変更を容易にする。
 */
export const NOT_FOUND_VIEW_MESSAGES = {
  DEFAULT_TITLE: 'ページが見つかりません',
  DEFAULT_DESCRIPTION:
    'お探しのページは移動または削除されたか、URL が間違っている可能性があります。',
  HOME_BUTTON: 'トップページへ戻る',
} as const;

/**
 * NotFoundView のプロパティ。
 */
export interface NotFoundViewProps {
  /**
   * 画面タイトル。デフォルト: "ページが見つかりません"
   */
  title?: string;
  /**
   * 説明文。デフォルト: "お探しのページは移動または削除されたか、URL が間違っている可能性があります。"
   */
  description?: string;
  /**
   * 「トップページへ戻る」の遷移先。デフォルト: "/"
   */
  homeHref?: string;
}

/**
 * ページが見つからない (404) ときの画面コンポーネント。
 *
 * 各サービスのレイアウトがすでに main ランドマークを持ち、この画面はその内側に描かれるため、
 * `role="main"` は付けない。トップへ戻る導線は libs/ui が next/link に依存しないよう素の `<a>` で描く。
 *
 * libs 内のため、パスエイリアス（@/）は使用せず相対 import のみを使用する。
 */
export default function NotFoundView({
  title = NOT_FOUND_VIEW_MESSAGES.DEFAULT_TITLE,
  description = NOT_FOUND_VIEW_MESSAGES.DEFAULT_DESCRIPTION,
  homeHref = '/',
}: NotFoundViewProps) {
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
          <Button asChild variant="solid" color="primary">
            <a href={homeHref}>{NOT_FOUND_VIEW_MESSAGES.HOME_BUTTON}</a>
          </Button>
        </Box>
      </Box>
    </Container>
  );
}
