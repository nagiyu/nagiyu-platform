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
  Chip,
} from '@mui/material';
import { Button } from '@nagiyu/ui';
import {
  getAllServiceSlugs,
  getServiceDocument,
  getAllArticles,
  getAllTags,
  isLinkableTag,
  tagToSlug,
} from '@/lib/content';
import { SERVICE_URLS, SERVICE_NAMES } from '@/lib/services';
import { buildOrganizationJsonLd, buildWebSiteJsonLd, jsonLdScript } from '@/lib/jsonLd';

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
  const articles = getAllArticles().slice(0, 6);
  const tags = getAllTags()
    .filter((entry) => entry.count >= 2 && isLinkableTag(entry.tag))
    .slice(0, 8);

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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(buildWebSiteJsonLd()) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(buildOrganizationJsonLd()) }}
      />
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

      {/* 技術記事プレビュー（最新 6 本） */}
      {articles.length > 0 && (
        <Box sx={{ mb: 6 }}>
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
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/tech/${article.slug}`}>記事を読む</Link>
                    </Button>
                  </CardActions>
                </Card>
              </Grid>
            ))}
          </Grid>
          <Box sx={{ mt: 2, textAlign: 'center' }}>
            <Button asChild variant="outline">
              <Link href="/tech">すべての技術記事を見る</Link>
            </Button>
          </Box>
        </Box>
      )}

      {/* おすすめ技術カテゴリ */}
      {tags.length > 0 && (
        <Box sx={{ mb: 6 }}>
          <Typography variant="h5" component="h2" gutterBottom sx={{ mb: 3 }}>
            おすすめ技術カテゴリ
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {tags.map((entry) => (
              <Chip
                key={entry.tag}
                label={`${entry.tag} (${entry.count})`}
                component="a"
                href={`/tech/tags/${tagToSlug(entry.tag)}`}
                clickable
                variant="outlined"
              />
            ))}
          </Box>
        </Box>
      )}

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
                    <Button asChild size="sm" variant="ghost">
                      <a href={`/services/${card.slug}`}>ドキュメント</a>
                    </Button>
                    <Button asChild size="sm" variant="ghost">
                      <a href={card.url} target="_blank" rel="noopener noreferrer">
                        サービスを開く
                      </a>
                    </Button>
                  </CardActions>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {/* About への CTA */}
      <Box sx={{ mb: 4, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          開発者プロフィール・運営方針・編集ポリシーは About ページをご覧ください。
        </Typography>
        <Button asChild variant="ghost">
          <a href="/about">nagiyu について</a>
        </Button>
      </Box>
    </Container>
  );
}
