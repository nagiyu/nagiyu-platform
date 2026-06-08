import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Container, Typography, Box, Card, CardActionArea, CardContent } from '@mui/material';
import { Chip } from '@nagiyu/ui';
import {
  getAllTags,
  getArticlesByTag,
  getTagBySlug,
  isLinkableTag,
  tagToSlug,
} from '@/lib/content';
import { buildBreadcrumbJsonLd, jsonLdScript } from '@/lib/jsonLd';

type Params = { params: Promise<{ tag: string }> };

export async function generateStaticParams() {
  return getAllTags()
    .filter((entry) => entry.count >= 2 && isLinkableTag(entry.tag))
    .map((entry) => ({ tag: tagToSlug(entry.tag) }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { tag: slug } = await params;
  const tag = getTagBySlug(slug) ?? slug;
  const url = `https://nagiyu.com/tech/tags/${slug}`;
  return {
    title: `${tag} の記事一覧`,
    description: `nagiyu の技術記事のうち「${tag}」タグが付いた記事の一覧です。`,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      url,
      title: `${tag} の記事一覧`,
      description: `nagiyu の技術記事のうち「${tag}」タグが付いた記事の一覧です。`,
      images: [{ url: '/og-default.png', width: 1200, height: 630, alt: `${tag} の記事一覧` }],
    },
  };
}

export default async function TagPage({ params }: Params) {
  const { tag: slug } = await params;
  const tag = getTagBySlug(slug);
  if (!tag) notFound();

  const articles = getArticlesByTag(tag);
  if (articles.length === 0) notFound();

  const breadcrumb = buildBreadcrumbJsonLd([
    { name: 'ホーム', url: 'https://nagiyu.com/' },
    { name: '技術記事', url: 'https://nagiyu.com/tech' },
    { name: tag, url: `https://nagiyu.com/tech/tags/${slug}` },
  ]);

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumb) }}
      />
      <Typography variant="h4" component="h1" gutterBottom>
        {tag} の記事一覧
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        全 {articles.length} 件
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {articles.map((article) => (
          <Card key={article.slug} variant="outlined">
            <CardActionArea href={`/tech/${article.slug}`}>
              <CardContent>
                <Typography variant="h6" component="h2" gutterBottom>
                  {article.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  {article.description}
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {article.tags.map((t) => (
                    <Chip key={t} size="sm" variant="outline">
                      {t}
                    </Chip>
                  ))}
                </Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ mt: 1, display: 'block' }}
                >
                  公開日: {article.publishedAt}
                </Typography>
              </CardContent>
            </CardActionArea>
          </Card>
        ))}
      </Box>
    </Container>
  );
}
