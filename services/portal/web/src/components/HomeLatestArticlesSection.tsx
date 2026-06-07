import Link from 'next/link';
import { Box, Typography, Grid, Card, CardContent, CardActions } from '@mui/material';
import { Button, Chip } from '@nagiyu/ui';
import type { ArticleMeta } from '@/types/content';

interface HomeLatestArticlesSectionProps {
  /** 最新記事一覧（最大 6 件） */
  articles: ArticleMeta[];
}

/**
 * トップページの最新記事リストセクション
 *
 * 最新 6 本の技術記事をカードグリッドで表示し、サイトの更新頻度を伝える。
 */
export default function HomeLatestArticlesSection({ articles }: HomeLatestArticlesSectionProps) {
  if (articles.length === 0) {
    return null;
  }

  return (
    <Box component="section" sx={{ mb: 6 }}>
      <Typography variant="h5" component="h2" gutterBottom sx={{ mb: 1, fontWeight: 600 }}>
        最新の技術記事
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        直近に公開・更新した技術記事です。AWS・Next.js・開発ツールを中心に記録しています。
      </Typography>
      <Grid container spacing={3}>
        {articles.map((article) => (
          <Grid size={{ xs: 12, sm: 6, md: 4 }} key={article.slug}>
            <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <CardContent sx={{ flexGrow: 1 }}>
                <Typography variant="h6" component="h3" gutterBottom sx={{ lineHeight: 1.4 }}>
                  {article.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1, lineHeight: 1.7 }}>
                  {article.description}
                </Typography>
                {/* 公開日 */}
                <Typography
                  variant="caption"
                  color="text.disabled"
                  sx={{ display: 'block', mb: 1 }}
                >
                  {article.publishedAt}
                </Typography>
                {/* タグ */}
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {article.tags.map((tag) => (
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
      <Box sx={{ mt: 3, textAlign: 'center' }}>
        <Button asChild variant="outline">
          <Link href="/tech">すべての技術記事を見る</Link>
        </Button>
      </Box>
    </Box>
  );
}
