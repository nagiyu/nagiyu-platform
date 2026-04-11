import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Container,
  Typography,
  Grid,
  Box,
  Card,
  CardContent,
  CardActions,
  Button,
  Chip,
} from '@mui/material';
import { getAllArticles } from '@/lib/content';

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

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom align="center">
        技術記事
      </Typography>

      <Typography variant="body1" paragraph align="center" sx={{ mb: 4 }}>
        nagiyu のサービス開発で得た技術知見・アーキテクチャ解説を公開しています。
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
                      <Chip key={tag} label={tag} size="small" variant="outlined" />
                    ))}
                  </Box>
                </CardContent>
                <CardActions>
                  <Button size="small" component={Link} href={`/tech/${article.slug}`}>
                    記事を読む
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
