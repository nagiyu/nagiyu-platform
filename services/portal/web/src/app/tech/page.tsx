import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Container,
  Typography,
  Grid,
  Box,
  Card,
  CardActionArea,
  CardContent,
  CardActions,
} from '@mui/material';
import { Button, Chip } from '@nagiyu/ui';
import { getAllArticles, getAllTechCategoryMetas } from '@/lib/content';

export const metadata: Metadata = {
  title: '技術記事',
  description:
    'nagiyu の技術記事一覧です。AWS Batch・Next.js SSG・Web Push・動画コーデック・CloudFront + ECS など、サービス開発で得た技術知見を公開しています。',
  alternates: {
    canonical: 'https://nagiyu.com/tech',
  },
};

export default function TechPage() {
  const articles = getAllArticles();
  const categories = getAllTechCategoryMetas();

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom align="center">
        技術記事
      </Typography>

      <Typography variant="body1" align="center" sx={{ mb: 4 }}>
        nagiyu のサービス開発で得た技術知見・アーキテクチャ解説を公開しています。
      </Typography>

      {/* カテゴリ別ハブ（テーマ深堀りページ）への導線 */}
      {categories.length > 0 && (
        <Box sx={{ mb: 5 }}>
          <Typography variant="h5" component="h2" gutterBottom>
            カテゴリ別ハブ
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            テーマごとの全体像と関連記事をまとめたページです。
          </Typography>
          <Grid container spacing={2}>
            {categories.map((category) => (
              <Grid size={{ xs: 12, sm: 4 }} key={category.slug}>
                <Card variant="outlined" sx={{ height: '100%' }}>
                  <CardActionArea href={`/tech/category/${category.slug}`} sx={{ height: '100%' }}>
                    <CardContent>
                      <Typography variant="h6" component="h3" gutterBottom>
                        {category.title}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {category.description}
                      </Typography>
                    </CardContent>
                  </CardActionArea>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      <Typography variant="h5" component="h2" gutterBottom>
        記事一覧
      </Typography>

      {articles.length === 0 ? (
        <Typography variant="body1" align="center" color="text.secondary">
          記事はまだありません。
        </Typography>
      ) : (
        <Grid container spacing={3}>
          {articles.map((article) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={article.slug}>
              <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <CardContent sx={{ flexGrow: 1 }}>
                  <Typography variant="h6" component="h2" gutterBottom>
                    {article.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    {article.description}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block', mb: 1 }}
                  >
                    {article.publishedAt}
                  </Typography>
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
      )}
    </Container>
  );
}
