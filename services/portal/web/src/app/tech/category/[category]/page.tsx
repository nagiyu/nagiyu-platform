import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  Container,
  Typography,
  Box,
  Card,
  CardActionArea,
  CardContent,
  Divider,
} from '@mui/material';
import { Chip } from '@nagiyu/ui';
import { TECH_CATEGORY_SLUGS, getArticlesByCategory, getTechCategory } from '@/lib/content';
import MarkdownContent from '@/components/MarkdownContent';
import { buildBreadcrumbJsonLd, jsonLdScript } from '@/lib/jsonLd';

type Params = { params: Promise<{ category: string }> };

export async function generateStaticParams() {
  return TECH_CATEGORY_SLUGS.map((category) => ({ category }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { category: slug } = await params;
  try {
    const category = await getTechCategory(slug);
    const url = `https://nagiyu.com/tech/category/${slug}`;
    return {
      title: category.title,
      description: category.description,
      alternates: { canonical: url },
      openGraph: {
        type: 'website',
        url,
        title: category.title,
        description: category.description,
        images: ['/og-default.png'],
      },
    };
  } catch {
    return { title: 'カテゴリ別ハブ' };
  }
}

export default async function TechCategoryPage({ params }: Params) {
  const { category: slug } = await params;

  let category;
  try {
    category = await getTechCategory(slug);
  } catch {
    notFound();
  }

  const articles = getArticlesByCategory(slug);

  const breadcrumb = buildBreadcrumbJsonLd([
    { name: 'ホーム', url: 'https://nagiyu.com/' },
    { name: '技術記事', url: 'https://nagiyu.com/tech' },
    { name: category.title, url: `https://nagiyu.com/tech/category/${slug}` },
  ]);

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumb) }}
      />
      <Typography variant="h4" component="h1" gutterBottom>
        {category.title}
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3, fontStyle: 'italic' }}>
        {category.description}
      </Typography>

      {/* ハブ解説本文 */}
      <MarkdownContent html={category.content} />

      {/* 関連記事リスト */}
      <Box sx={{ mt: 6 }}>
        <Divider sx={{ mb: 3 }} />
        <Typography variant="h5" component="h2" gutterBottom>
          このカテゴリの記事（全 {articles.length} 件）
        </Typography>
        {articles.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            記事はまだありません。
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {articles.map((article) => (
              <Card key={article.slug} variant="outlined">
                <CardActionArea href={`/tech/${article.slug}`}>
                  <CardContent>
                    <Typography variant="h6" component="h3" gutterBottom>
                      {article.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      {article.description}
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
                      {article.tags.map((tag) => (
                        <Chip key={tag} size="sm" variant="outline">
                          {tag}
                        </Chip>
                      ))}
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      公開日: {article.publishedAt}
                    </Typography>
                  </CardContent>
                </CardActionArea>
              </Card>
            ))}
          </Box>
        )}
      </Box>
    </Container>
  );
}
