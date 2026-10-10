import type { Metadata } from 'next';
import { Container, Typography } from '@mui/material';
import { LegalSections, termSections } from '@nagiyu/ui';

export const metadata: Metadata = {
  title: '利用規約',
  description: 'nagiyu の利用規約です。本サービスを利用する前に必ずお読みください。',
  alternates: { canonical: 'https://nagiyu.com/terms' },
};

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
