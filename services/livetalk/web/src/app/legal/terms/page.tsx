import type { Metadata } from 'next';
import { Container, Typography, Box } from '@mui/material';
import { Link, LegalSections } from '@nagiyu/ui';
import { liveTalkTermsSections, LIVETALK_TERMS_VERSION } from '@/lib/legal/terms-data';

export const metadata: Metadata = {
  title: '利用規約 | リブトーク',
  description: 'リブトーク（LiveTalk）の利用規約です。',
};

export default function TermsPage() {
  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom align="center">
        利用規約
      </Typography>
      <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 4 }}>
        バージョン {LIVETALK_TERMS_VERSION}
      </Typography>

      <LegalSections sections={liveTalkTermsSections} />

      <Box sx={{ mt: 4, pt: 2, borderTop: 1, borderColor: 'divider' }}>
        <Link href="/legal/privacy">プライバシーポリシーを見る</Link>
      </Box>
    </Container>
  );
}
