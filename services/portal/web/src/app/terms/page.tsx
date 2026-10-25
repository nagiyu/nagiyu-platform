import type { Metadata } from 'next';
import { Container, Typography } from '@mui/material';
import { LegalSections, termSections } from '@nagiyu/ui';
import { buildPageMetadata } from '@/lib/pageMetadata';

export const metadata: Metadata = buildPageMetadata(
  '利用規約',
  'nagiyu の利用規約です。本サービスを利用する前に必ずお読みください。',
  '/terms'
);

export default function TermsPage() {
  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom align="center">
        利用規約
      </Typography>
      <LegalSections sections={termSections} />
    </Container>
  );
}
