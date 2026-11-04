'use client';

import Link from 'next/link';
import { Box, CardActionArea, Typography } from '@mui/material';
import type { ReactNode } from 'react';

interface ArticleCardLinkProps {
  /** 遷移先の記事スラッグ */
  slug: string;
  /** カードの中身（CardContent など） */
  children: ReactNode;
  /** 「記事を読む」を出さない (既定は出す)。省いても同じ遷移先への案内が減るだけで、リンクの機能は変わらない */
  hideReadMore?: boolean;
}

/**
 * 記事カード全体を記事へのリンクにする
 *
 * 「記事を読む」は同じ遷移先への案内でしかないため、リンクの入れ子を避けて表示だけにする。
 * カード全体が既にリンクで遷移先も同じなので、案内を省いても情報は欠けない。
 * 他の記事と並べず見出し配下に小さく添える関連記事のように、案内が過剰な場面は `hideReadMore` で省く。
 * `component={Link}` は関数のため Server Component から渡せず、このコンポーネントを Client Component にしている。
 * Card の高さ揃え（flex column）を保つため、CardActionArea 自体も縦に伸ばす。
 */
export default function ArticleCardLink({
  slug,
  children,
  hideReadMore = false,
}: ArticleCardLinkProps) {
  return (
    <CardActionArea
      component={Link}
      href={`/tech/${slug}`}
      sx={{
        flexGrow: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        justifyContent: 'flex-start',
      }}
    >
      {children}
      {!hideReadMore && (
        <Box sx={{ px: 2, pb: 2 }}>
          <Typography variant="body2" color="primary" sx={{ fontWeight: 600 }}>
            記事を読む
          </Typography>
        </Box>
      )}
    </CardActionArea>
  );
}
