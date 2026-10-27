import type { Metadata } from 'next';
import { Container, Typography } from '@mui/material';
import { LegalSections, privacyPolicySections } from '@nagiyu/ui';
import { buildPageMetadata } from '@/lib/pageMetadata';

export const metadata: Metadata = buildPageMetadata(
  'プライバシーポリシー',
  'nagiyu のプライバシーポリシーです。Cookie の取り扱い・アクセスログ収集・個人情報の保護方針について説明します。',
  '/privacy'
);

export default function PrivacyPage() {
  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom align="center">
        プライバシーポリシー
      </Typography>
      <LegalSections sections={privacyPolicySections} />
    </Container>
  );
}
