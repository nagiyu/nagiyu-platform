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
import { Chip, Link } from '@nagiyu/ui';
import { getAllArticles, getArticle, getRelatedArticles } from '@/lib/content';
import MarkdownContent from '@/components/MarkdownContent';
import { buildBlogPostingJsonLd, buildBreadcrumbJsonLd, jsonLdScript } from '@/lib/jsonLd';
import { AUTHOR } from '@/lib/author';

/**
 * 日本語想定で 500 文字 / 分の読了時間を見積もる。HTML タグは除外。
 */
function estimateReadingMinutes(html: string): number {
  const plain = html.replace(/<[^>]+>/g, '').replace(/\s+/g, '');
  return Math.max(1, Math.ceil(plain.length / 500));
}

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

  const authorName = article.author ?? AUTHOR.name;
  const readingMinutes = estimateReadingMinutes(article.content);
  const relatedArticles = getRelatedArticles(article.slug, article.tags, 3);

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
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1, flexWrap: 'wrap' }}>
        <Typography variant="caption" color="text.secondary">
          著者:{' '}
          <Link href="/about">{authorName}</Link>
        </Typography>
        <Typography variant="caption" color="text.secondary">
          公開日: {article.publishedAt}
        </Typography>
        {article.updatedAt && article.updatedAt !== article.publishedAt && (
          <Typography variant="caption" color="text.secondary">
            最終更新: {article.updatedAt}
          </Typography>
        )}
        <Typography variant="caption" color="text.secondary">
          読了目安: 約 {readingMinutes} 分
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 3 }}>
        {article.tags.map((tag) => (
          <Chip key={tag} size="sm" variant="outline">
            {tag}
          </Chip>
        ))}
      </Box>

      {/* 記事概要 */}
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3, fontStyle: 'italic' }}>
        {article.description}
      </Typography>

      {/* Markdown コンテンツ */}
      <MarkdownContent html={article.content} />

      {/* 関連記事 */}
      {relatedArticles.length > 0 && (
        <Box sx={{ mt: 6 }}>
          <Divider sx={{ mb: 3 }} />
          <Typography variant="h6" component="h2" gutterBottom>
            関連記事
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {relatedArticles.map((related) => (
              <Card key={related.slug} variant="outlined">
                <CardActionArea href={`/tech/${related.slug}`}>
                  <CardContent>
                    <Typography variant="subtitle1" component="h3" gutterBottom>
                      {related.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      {related.description}
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {related.tags.map((tag) => (
                        <Chip key={tag} size="sm" variant="outline">
                          {tag}
                        </Chip>
                      ))}
                    </Box>
                  </CardContent>
                </CardActionArea>
              </Card>
            ))}
          </Box>
        </Box>
      )}
    </Container>
  );
}
