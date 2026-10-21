import type { Metadata } from 'next';
import { Container, Typography, Box } from '@mui/material';
import { Link, LegalSections } from '@nagiyu/ui';
import { liveTalkPrivacySections, LIVETALK_PRIVACY_VERSION } from '@/lib/legal/privacy-data';

export const metadata: Metadata = {
  title: 'プライバシーポリシー | リブトーク',
  description: 'リブトーク（LiveTalk）のプライバシーポリシーです。',
};

export default function PrivacyPage() {
  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom align="center">
        プライバシーポリシー
      </Typography>
      <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 4 }}>
        バージョン {LIVETALK_PRIVACY_VERSION}
      </Typography>

      <LegalSections sections={liveTalkPrivacySections} />

      <Box sx={{ mt: 4, pt: 2, borderTop: 1, borderColor: 'divider' }}>
        <Link href="/legal/terms">利用規約を見る</Link>
      </Box>
    </Container>
  );
}
