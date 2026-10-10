import type { Metadata } from 'next';
import { Container, Typography } from '@mui/material';
import { LegalSections, privacyPolicySections } from '@nagiyu/ui';

export const metadata: Metadata = {
  title: 'プライバシーポリシー',
  description:
    'nagiyu のプライバシーポリシーです。Cookie の取り扱い・アクセスログ収集・個人情報の保護方針について説明します。',
  alternates: { canonical: 'https://nagiyu.com/privacy' },
};

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
