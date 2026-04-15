import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Container, Typography } from '@mui/material';
import { getAllServiceSlugs, getServiceDocument } from '@/lib/content';
import { SERVICE_NAMES } from '@/lib/services';
import MarkdownContent from '@/components/MarkdownContent';
import ServiceDocumentNav from '@/components/ServiceDocumentNav';

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
    const doc = await getServiceDocument(slug, 'faq');
    return {
      title: doc.title,
      description: doc.description,
      alternates: {
        canonical: `https://nagiyu.com/services/${slug}/faq`,
      },
    };
  } catch {
    return { title: 'FAQ' };
  }
}

export default async function ServiceFaqPage({ params }: Params) {
  const { slug } = await params;

  let doc;
  try {
    doc = await getServiceDocument(slug, 'faq');
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
      <ServiceDocumentNav slug={slug} value={2} />

      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
        {serviceName} によくある質問
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
