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
import { getAllServiceSlugs, getServiceDocument, getAllArticles } from '@/lib/content';
import { SERVICE_URLS, SERVICE_NAMES } from '@/lib/services';

export const metadata: Metadata = {
  title: 'nagiyu - サービス一覧・技術ポータル',
  description:
    'nagiyu が提供する Tools・Quick Clip・Codec Converter・Stock Tracker など各種サービスのドキュメント、使い方ガイド、技術記事を掲載しています。',
  alternates: {
    canonical: 'https://nagiyu.com',
  },
};

export default async function HomePage() {
  const slugs = getAllServiceSlugs();
  const articles = getAllArticles().slice(0, 3);

  const serviceCards = await Promise.all(
    slugs.map(async (slug) => {
      try {
        const doc = await getServiceDocument(slug, 'overview');
        return {
          slug,
          name: SERVICE_NAMES[slug] ?? slug,
          description: doc.description,
          url: SERVICE_URLS[slug] ?? '#',
        };
      } catch {
        return null;
      }
    })
  );

  const validServiceCards = serviceCards.filter((card) => card !== null);

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* ヒーローセクション */}
      <Box sx={{ mb: 6, textAlign: 'center' }}>
        <Typography variant="h3" component="h1" gutterBottom sx={{ fontWeight: 700 }}>
          nagiyu
        </Typography>
        <Typography variant="h6" color="text.secondary" sx={{ maxWidth: 700, mx: 'auto' }}>
          nagiyu
          が提供する各種サービスのドキュメント・使い方ガイド・技術記事を掲載したポータルサイトです。
          Tools・Quick Clip・Codec Converter など、便利なサービスをご活用ください。
        </Typography>
      </Box>

      {/* サービスカードグリッド */}
      {validServiceCards.length > 0 && (
        <Box sx={{ mb: 6 }}>
          <Typography variant="h5" component="h2" gutterBottom sx={{ mb: 3 }}>
            サービス一覧
          </Typography>
          <Grid container spacing={3}>
            {validServiceCards.map((card) => (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={card.slug}>
                <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <CardContent sx={{ flexGrow: 1 }}>
                    <Typography variant="h6" component="h3" gutterBottom>
                      {card.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {card.description}
                    </Typography>
                  </CardContent>
                  <CardActions>
                    <Button size="small" component={Link} href={`/services/${card.slug}`}>
                      ドキュメント
                    </Button>
                    <Button size="small" href={card.url} target="_blank" rel="noopener noreferrer">
                      サービスを開く
                    </Button>
                  </CardActions>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {/* 技術記事プレビュー */}
      {articles.length > 0 && (
        <Box sx={{ mb: 4 }}>
          <Typography variant="h5" component="h2" gutterBottom sx={{ mb: 3 }}>
            最新の技術記事
          </Typography>
          <Grid container spacing={3}>
            {articles.map((article) => (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={article.slug}>
                <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <CardContent sx={{ flexGrow: 1 }}>
                    <Typography variant="h6" component="h3" gutterBottom>
                      {article.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      {article.description}
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
          <Box sx={{ mt: 2, textAlign: 'center' }}>
            <Button component={Link} href="/tech" variant="outlined">
              すべての技術記事を見る
            </Button>
          </Box>
        </Box>
      )}
    </Container>
  );
}
