'use client';

import Link from 'next/link';
import { Box, Tabs, Tab } from '@mui/material';

interface ServiceDocumentNavProps {
  slug: string;
  value: 0 | 1 | 2;
}

export default function ServiceDocumentNav({ slug, value }: ServiceDocumentNavProps) {
  return (
    <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
      <Tabs value={value} aria-label="サービスドキュメントナビゲーション">
        <Tab label="概要" component={Link} href={`/services/${slug}`} />
        <Tab label="使い方ガイド" component={Link} href={`/services/${slug}/guide`} />
        <Tab label="FAQ" component={Link} href={`/services/${slug}/faq`} />
      </Tabs>
    </Box>
  );
}
