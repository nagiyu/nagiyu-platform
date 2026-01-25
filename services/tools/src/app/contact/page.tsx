import type { Metadata } from 'next';
import { Container, Typography, Box, Link } from '@mui/material';

export const metadata: Metadata = {
  title: 'お問い合わせ - Tools',
  description: 'Tools へのお問い合わせ方法',
  alternates: {
    canonical: 'https://nagiyu.com/contact',
  },
};

export default function ContactPage() {
  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom align="center">
        お問い合わせ
      </Typography>

      <Box sx={{ mb: 4 }}>
        <Typography variant="h6" component="h2" gutterBottom sx={{ fontWeight: 600 }}>
          お問い合わせ方法
        </Typography>
        <Typography variant="body1" paragraph>
          バグ報告や機能要望は、GitHub Issues でお願いします。
        </Typography>
        <Typography variant="body1" paragraph>
          <Link
            href="https://github.com/nagiyu/nagiyu-platform/issues"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub Issues - nagiyu-platform
          </Link>
        </Typography>
      </Box>

      <Box sx={{ mb: 4 }}>
        <Typography variant="h6" component="h2" gutterBottom sx={{ fontWeight: 600 }}>
          その他のお問い合わせ
        </Typography>
        <Typography variant="body1" paragraph>
          GitHub Issues 以外のお問い合わせは、下記のフォームをご利用ください。
        </Typography>
        <Typography variant="body1" paragraph>
          <Link
            href="https://forms.gle/oxzHNFBWBpFGNaKm7"
            target="_blank"
            rel="noopener noreferrer"
          >
            お問い合わせフォーム
          </Link>
        </Typography>
      </Box>

      <Box sx={{ mb: 4 }}>
        <Typography variant="h6" component="h2" gutterBottom sx={{ fontWeight: 600 }}>
          注意事項
        </Typography>
        <Box component="ul" sx={{ pl: 3 }}>
          <Box component="li" sx={{ mb: 1 }}>
            <Typography variant="body1">
              個人プロジェクトのため、すべての要望に対応できるわけではありません。
            </Typography>
          </Box>
          <Box component="li" sx={{ mb: 1 }}>
            <Typography variant="body1">回答までにお時間をいただく場合があります。</Typography>
          </Box>
          <Box component="li" sx={{ mb: 1 }}>
            <Typography variant="body1">技術的なサポートは提供しておりません。</Typography>
          </Box>
        </Box>
      </Box>
    </Container>
  );
}
