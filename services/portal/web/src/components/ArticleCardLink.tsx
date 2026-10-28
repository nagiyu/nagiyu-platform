'use client';

import Link from 'next/link';
import { Box, CardActionArea, Typography } from '@mui/material';
import type { ReactNode } from 'react';

interface ArticleCardLinkProps {
  /** 遷移先の記事スラッグ */
  slug: string;
  /** カードの中身（CardContent など） */
  children: ReactNode;
}

/**
 * 記事カード全体を記事へのリンクにする
 *
 * 「記事を読む」は同じ遷移先への案内でしかないため、リンクの入れ子を避けて表示だけにする。
 * `component={Link}` は関数のため Server Component から渡せず、このコンポーネントを Client Component にしている。
 * Card の高さ揃え（flex column）を保つため、CardActionArea 自体も縦に伸ばす。
 */
export default function ArticleCardLink({ slug, children }: ArticleCardLinkProps) {
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
      <Box sx={{ px: 2, pb: 2 }}>
        <Typography variant="body2" color="primary" sx={{ fontWeight: 600 }}>
          記事を読む
        </Typography>
      </Box>
    </CardActionArea>
  );
}
