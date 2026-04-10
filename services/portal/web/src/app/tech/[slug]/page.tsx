import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Container, Typography, Box, Chip } from '@mui/material';
import { getAllArticles, getArticle } from '@/lib/content';
import MarkdownContent from '@/components/MarkdownContent';

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
    return {
      title: article.title,
      description: article.description,
      alternates: {
        canonical: `https://nagiyu.com/tech/${slug}`,
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

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
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
