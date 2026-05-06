import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Container, Typography, Box } from '@mui/material';
import { Button } from '@nagiyu/ui';
import { getAllServiceSlugs, getServiceDocument } from '@/lib/content';
import { SERVICE_URLS, SERVICE_NAMES } from '@/lib/services';
import MarkdownContent from '@/components/MarkdownContent';
import ServiceDocumentNav from '@/components/ServiceDocumentNav';
import { buildBreadcrumbJsonLd, jsonLdScript } from '@/lib/jsonLd';

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

  const breadcrumb = buildBreadcrumbJsonLd([
    { name: 'ホーム', url: 'https://nagiyu.com/' },
    { name: 'サービス', url: 'https://nagiyu.com/services' },
    { name: serviceName, url: `https://nagiyu.com/services/${slug}` },
  ]);

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumb) }}
      />
      <Typography variant="h4" component="h1" gutterBottom>
        {doc.title}
      </Typography>

      {/* サブページナビゲーション */}
      <ServiceDocumentNav slug={slug} value={0} />

      {/* 外部リンク */}
      {serviceUrl && (
        <Box sx={{ mb: 3 }}>
          <Button asChild variant="solid">
            <a href={serviceUrl} target="_blank" rel="noopener noreferrer">
              {serviceName} を開く
            </a>
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
