import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Container, Typography, Box, Button, Tabs, Tab } from '@mui/material';
import { getAllServiceSlugs, getServiceDocument } from '@/lib/content';
import { SERVICE_URLS, SERVICE_NAMES } from '@/lib/services';
import MarkdownContent from '@/components/MarkdownContent';

type Params = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  const slugs = getAllServiceSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  try {
    const doc = await getServiceDocument(slug, 'overview');
    return {
      title: doc.title,
      description: doc.description,
      alternates: {
        canonical: `https://nagiyu.com/services/${slug}`,
      },
    };
  } catch {
    return { title: 'サービス' };
  }
}

export default async function ServicePage({ params }: Params) {
  const { slug } = await params;

  let doc;
  try {
    doc = await getServiceDocument(slug, 'overview');
  } catch {
    notFound();
  }

  const serviceUrl = SERVICE_URLS[slug];
  const serviceName = SERVICE_NAMES[slug] ?? slug;

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        {doc.title}
      </Typography>

      {/* サブページナビゲーション */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={0} aria-label="サービスドキュメントナビゲーション">
          <Tab label="概要" component={Link} href={`/services/${slug}`} />
          <Tab label="使い方ガイド" component={Link} href={`/services/${slug}/guide`} />
          <Tab label="FAQ" component={Link} href={`/services/${slug}/faq`} />
        </Tabs>
      </Box>

      {/* 外部リンク */}
      {serviceUrl && (
        <Box sx={{ mb: 3 }}>
          <Button variant="contained" href={serviceUrl} target="_blank" rel="noopener noreferrer">
            {serviceName} を開く
          </Button>
        </Box>
      )}

      {/* Markdown コンテンツ */}
      <MarkdownContent html={doc.content} />

      {/* 最終更新日 */}
      <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
        最終更新: {doc.updatedAt}
      </Typography>
    </Container>
  );
}
