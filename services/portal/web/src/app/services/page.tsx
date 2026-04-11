import type { Metadata } from 'next';
import { Container, Typography, Grid, Card, CardContent, CardActions, Button } from '@mui/material';
import { getAllServiceSlugs, getServiceDocument } from '@/lib/content';
import { SERVICE_URLS, SERVICE_NAMES } from '@/lib/services';

export const metadata: Metadata = {
  title: 'サービス一覧',
  description:
    'nagiyu が提供する Tools・Quick Clip・Codec Converter・Stock Tracker など全サービスの一覧です。各サービスのドキュメントや使い方ガイドをご確認いただけます。',
  alternates: {
    canonical: 'https://nagiyu.com/services',
  },
};

export default async function ServicesPage() {
  const slugs = getAllServiceSlugs();

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
      <Typography variant="h4" component="h1" gutterBottom align="center">
        サービス一覧
      </Typography>

      <Typography variant="body1" paragraph align="center" sx={{ mb: 4 }}>
        nagiyu が提供する各種 Web
        サービスの一覧です。各サービスのドキュメントや使い方ガイドをご確認ください。
      </Typography>

      <Grid container spacing={3}>
        {validServiceCards.map((card) => (
          <Grid size={{ xs: 12, sm: 6, md: 4 }} key={card.slug}>
            <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <CardContent sx={{ flexGrow: 1 }}>
                <Typography variant="h6" component="h2" gutterBottom>
                  {card.name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {card.description}
                </Typography>
              </CardContent>
              <CardActions>
                <Button size="small" href={`/services/${card.slug}`}>
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
    </Container>
  );
}
