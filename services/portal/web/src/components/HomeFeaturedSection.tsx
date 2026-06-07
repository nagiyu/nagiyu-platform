import Link from 'next/link';
import { Box, Typography, Grid, Card, CardContent, CardActions, Chip as MuiChip } from '@mui/material';
import { Button, Chip } from '@nagiyu/ui';
import type { ArticleMeta } from '@/types/content';

interface HomeFeaturedSectionProps {
  /** featured: true の記事一覧（最大 3 件） */
  articles: ArticleMeta[];
}

/**
 * トップページの特集記事セクション
 *
 * フロントマターに `featured: true` が設定された記事を最大 3 本表示する。
 * 記事がゼロ件の場合はこのセクション自体を非表示にする（空枠を出さない）。
 */
export default function HomeFeaturedSection({ articles }: HomeFeaturedSectionProps) {
  if (articles.length === 0) {
    return null;
  }

  return (
    <Box component="section" sx={{ mb: 6 }}>
      <Typography variant="h5" component="h2" gutterBottom sx={{ mb: 3, fontWeight: 600 }}>
        特集記事
      </Typography>
      <Grid container spacing={3}>
        {articles.map((article) => (
          <Grid size={{ xs: 12, md: 4 }} key={article.slug}>
            <Card
              sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                border: '1px solid',
                borderColor: 'primary.light',
                borderTop: '3px solid',
                borderTopColor: 'primary.main',
              }}
            >
              <CardContent sx={{ flexGrow: 1 }}>
                {/* 特集バッジ */}
                <MuiChip
                  label="特集"
                  size="small"
                  color="primary"
                  sx={{ mb: 1.5, fontSize: '0.7rem', height: 22 }}
                />

                {/* タイトル */}
                <Typography
                  variant="h6"
                  component="h3"
                  gutterBottom
                  sx={{ fontWeight: 600, lineHeight: 1.4 }}
                >
                  {article.title}
                </Typography>

                {/* 本文冒頭プレビュー（description を 150 字以内で表示） */}
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mb: 1.5, lineHeight: 1.7 }}
                >
                  {article.description.length > 150
                    ? `${article.description.slice(0, 150)}…`
                    : article.description}
                </Typography>

                {/* 公開日 */}
                <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 1 }}>
                  {article.publishedAt}
                </Typography>

                {/* タグ */}
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {article.tags.slice(0, 3).map((tag) => (
                    <Chip key={tag} size="sm" variant="outline">
                      {tag}
                    </Chip>
                  ))}
                </Box>
              </CardContent>
              <CardActions>
                <Button asChild size="sm" variant="ghost">
                  <Link href={`/tech/${article.slug}`}>記事を読む</Link>
                </Button>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
