import type { Metadata } from 'next';
import { Container, Typography, Grid, Box } from '@mui/material';
import TrainIcon from '@mui/icons-material/Train';
import ToolCard from '@/components/tools/ToolCard';
import { Tool } from '@/types/tools';

export const metadata: Metadata = {
  title: 'ホーム',
  description:
    'Toolsは、日常的に便利なオンラインツール群を提供する無料のWebアプリケーションです。乗り換え案内の整形ツール、今後追加予定の様々なツールを無料で利用できます。すべてのツールはブラウザ内で動作し、入力データは外部に送信されません。PWA対応でオフライン環境でも利用可能です。',
  openGraph: {
    title: 'Tools - 便利なオンラインツール集',
    description:
      'Toolsは、日常的に便利なオンラインツール群を提供する無料のWebアプリケーションです。',
  },
  alternates: {
    canonical: 'https://nagiyu.com',
  },
};

export default function HomePage() {
  const tools: Tool[] = [
    {
      id: 'transit-converter',
      title: '乗り換え変換ツール',
      description: '乗り換え案内のテキストを整形してコピーします',
      icon: <TrainIcon sx={{ fontSize: 48 }} />,
      href: '/transit-converter',
      category: '変換ツール',
    },
  ];

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom align="center">
        Tools - 便利なツール集
      </Typography>

      {/* サイトの概要説明 */}
      <Box sx={{ mb: 6, mt: 3 }}>
        <Typography variant="body1" paragraph align="center" sx={{ fontSize: '1.1rem' }}>
          Toolsは、日常的に便利なツール群を提供する無料のWebアプリケーションです。
          すべてのツールはブラウザ内で動作し、入力データは外部に送信されません。
          プライバシーを重視した設計で、安心してご利用いただけます。
        </Typography>
        <Typography variant="body1" paragraph align="center" sx={{ fontSize: '1.1rem' }}>
          開発者や一般ユーザーを問わず、誰でも無料で利用できます。
          乗り換え案内の整形や、今後追加予定の様々なツールをお役立てください。
        </Typography>
        <Typography variant="body1" paragraph align="center" sx={{ fontSize: '1.1rem' }}>
          PWA（Progressive Web App）として、スマートフォンのホーム画面に追加して、
          アプリのように使うこともできます。オフラインでも基本的な機能が動作します。
        </Typography>
      </Box>

      {/* 提供ツール */}
      <Box sx={{ mb: 6 }}>
        <Typography variant="h5" component="h2" gutterBottom align="center" sx={{ mb: 3 }}>
          提供ツール
        </Typography>
        <Grid container spacing={3}>
          {tools.map((tool) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={tool.id}>
              <ToolCard {...tool} />
            </Grid>
          ))}
        </Grid>
      </Box>

      {/* サイトの特徴 */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h5" component="h2" gutterBottom align="center" sx={{ mb: 3 }}>
          特徴
        </Typography>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
            gap: 3,
          }}
        >
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h6" component="h3" gutterBottom sx={{ fontWeight: 600 }}>
              🔒 プライバシー保護
            </Typography>
            <Typography variant="body2" color="text.secondary">
              すべてのデータはブラウザ内でのみ処理されます。入力されたデータはサーバーに送信されないため、
              安心してご利用いただけます。
            </Typography>
          </Box>
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h6" component="h3" gutterBottom sx={{ fontWeight: 600 }}>
              📱 オフライン対応
            </Typography>
            <Typography variant="body2" color="text.secondary">
              PWAとしてインストールすることで、オフライン環境でも基本的なツールを利用できます。
              通信環境を気にせず使えます。
            </Typography>
          </Box>
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h6" component="h3" gutterBottom sx={{ fontWeight: 600 }}>
              💯 完全無料
            </Typography>
            <Typography variant="body2" color="text.secondary">
              すべての機能を無料で利用できます。アカウント登録も不要です。
              ブラウザでアクセスするだけで、すぐに使い始められます。
            </Typography>
          </Box>
        </Box>
      </Box>
    </Container>
  );
}
