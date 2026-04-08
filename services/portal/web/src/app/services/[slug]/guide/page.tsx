import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Container, Typography, Box, Tabs, Tab } from '@mui/material';
import { getAllServiceSlugs, getServiceDocument } from '@/lib/content';
import { SERVICE_NAMES } from '@/lib/services';
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
    const doc = await getServiceDocument(slug, 'guide');
    return {
      title: doc.title,
      description: doc.description,
      alternates: {
        canonical: `https://nagiyu.com/services/${slug}/guide`,
      },
    };
  } catch {
    return { title: '使い方ガイド' };
  }
}

export default async function ServiceGuidePage({ params }: Params) {
  const { slug } = await params;

  let doc;
  try {
    doc = await getServiceDocument(slug, 'guide');
  } catch {
    notFound();
  }

  const serviceName = SERVICE_NAMES[slug] ?? slug;

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        {doc.title}
      </Typography>

      {/* サブページナビゲーション */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={1} aria-label="サービスドキュメントナビゲーション">
          <Tab label="概要" component={Link} href={`/services/${slug}`} />
          <Tab label="使い方ガイド" component={Link} href={`/services/${slug}/guide`} />
          <Tab label="FAQ" component={Link} href={`/services/${slug}/faq`} />
        </Tabs>
      </Box>

      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
        {serviceName} の使い方ガイド
      </Typography>

      {/* Markdown コンテンツ */}
      <MarkdownContent html={doc.content} />

      {/* 最終更新日 */}
      <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
        最終更新: {doc.updatedAt}
      </Typography>
    </Container>
  );
}
