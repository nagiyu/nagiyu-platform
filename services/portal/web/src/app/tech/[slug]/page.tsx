import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Container, Typography, Box, Chip } from '@mui/material';
import { getAllArticles, getArticle } from '@/lib/content';
import MarkdownContent from '@/components/MarkdownContent';
import { buildBlogPostingJsonLd, buildBreadcrumbJsonLd, jsonLdScript } from '@/lib/jsonLd';
import { AUTHOR } from '@/lib/author';

type Params = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  const articles = getAllArticles();
  return articles.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  try {
    const article = await getArticle(slug);
    const url = `https://nagiyu.com/tech/${slug}`;
    return {
      title: article.title,
      description: article.description,
      authors: [{ name: article.author ?? AUTHOR.name, url: AUTHOR.url }],
      alternates: {
        canonical: url,
      },
      openGraph: {
        type: 'article',
        url,
        title: article.title,
        description: article.description,
        publishedTime: new Date(article.publishedAt).toISOString(),
        modifiedTime: article.updatedAt
          ? new Date(article.updatedAt).toISOString()
          : new Date(article.publishedAt).toISOString(),
        authors: [AUTHOR.url],
        tags: article.tags,
        images: ['/og-default.png'],
      },
      twitter: {
        card: 'summary_large_image',
        title: article.title,
        description: article.description,
        images: ['/og-default.png'],
      },
    };
  } catch {
    return { title: '技術記事' };
  }
}

export default async function TechArticlePage({ params }: Params) {
  const { slug } = await params;

  let article;
  try {
    article = await getArticle(slug);
  } catch {
    notFound();
  }

  const breadcrumb = buildBreadcrumbJsonLd([
    { name: 'ホーム', url: 'https://nagiyu.com/' },
    { name: '技術記事', url: 'https://nagiyu.com/tech' },
    { name: article.title, url: `https://nagiyu.com/tech/${article.slug}` },
  ]);

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(buildBlogPostingJsonLd(article)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumb) }}
      />
      <Typography variant="h4" component="h1" gutterBottom>
        {article.title}
      </Typography>

      {/* メタ情報 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <Typography variant="caption" color="text.secondary">
          公開日: {article.publishedAt}
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {article.tags.map((tag) => (
            <Chip key={tag} label={tag} size="small" variant="outlined" />
          ))}
        </Box>
      </Box>

      {/* 記事概要 */}
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3, fontStyle: 'italic' }}>
        {article.description}
      </Typography>

      {/* Markdown コンテンツ */}
      <MarkdownContent html={article.content} />
    </Container>
  );
}
