import type { Metadata } from 'next';
import { Container, Typography, Box, Link } from '@mui/material';

export const metadata: Metadata = {
  title: 'Tools について - Tools',
  description: 'Tools サイトの概要と提供ツールの紹介',
};

export default function AboutPage() {
  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom align="center">
        Tools について
      </Typography>

      <Box sx={{ mb: 4 }}>
        <Typography variant="h6" component="h2" gutterBottom sx={{ fontWeight: 600 }}>
          サイトの目的
        </Typography>
        <Typography variant="body1" paragraph>
          Tools は、日常的に便利なツール群を提供する無料の Web アプリケーションです。
        </Typography>
        <Typography variant="body1" paragraph>
          すべてのツールはブラウザ内で動作し、入力されたデータはサーバーに送信されません。
          プライバシーを重視した設計となっています。
        </Typography>
      </Box>

      <Box sx={{ mb: 4 }}>
        <Typography variant="h6" component="h2" gutterBottom sx={{ fontWeight: 600 }}>
          提供ツール
        </Typography>
        <Box component="ul" sx={{ pl: 3 }}>
          <Box component="li" sx={{ mb: 1 }}>
            <Typography variant="body1">
              <strong>乗り換え変換ツール</strong>: 乗り換え案内のテキストを整形してコピー
            </Typography>
          </Box>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          今後も便利なツールを追加していく予定です。
        </Typography>
      </Box>

      <Box sx={{ mb: 4 }}>
        <Typography variant="h6" component="h2" gutterBottom sx={{ fontWeight: 600 }}>
          技術スタック
        </Typography>
        <Box component="ul" sx={{ pl: 3 }}>
          <Box component="li" sx={{ mb: 1 }}>
            <Typography variant="body1">Next.js (App Router)</Typography>
          </Box>
          <Box component="li" sx={{ mb: 1 }}>
            <Typography variant="body1">Material-UI</Typography>
          </Box>
          <Box component="li" sx={{ mb: 1 }}>
            <Typography variant="body1">TypeScript</Typography>
          </Box>
          <Box component="li" sx={{ mb: 1 }}>
            <Typography variant="body1">PWA 対応</Typography>
          </Box>
        </Box>
      </Box>

      <Box sx={{ mb: 4 }}>
        <Typography variant="h6" component="h2" gutterBottom sx={{ fontWeight: 600 }}>
          開発者
        </Typography>
        <Typography variant="body1" paragraph>
          なぎゆー（個人開発者）
        </Typography>
        <Typography variant="body2" color="text.secondary">
          GitHub:{' '}
          <Link
            href="https://github.com/nagiyu/nagiyu-platform"
            target="_blank"
            rel="noopener noreferrer"
          >
            nagiyu-platform
          </Link>
        </Typography>
      </Box>
    </Container>
  );
}
