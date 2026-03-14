import type { Metadata } from 'next';
import { Container, Typography, Grid, Box } from '@mui/material';
import TrainIcon from '@mui/icons-material/Train';
import DataObjectIcon from '@mui/icons-material/DataObject';
import KeyIcon from '@mui/icons-material/Key';
import ToolCard from '@/components/tools/ToolCard';
import { homeStructuredData, toJsonLd } from '@/lib/structuredData';
import { Tool } from '@/types/tools';

export const metadata: Metadata = {
  title: 'Tools - 便利なオンラインツール集',
  description:
    'Toolsは、日常作業を効率化する無料のオンラインツール集です。乗り換え変換ツール、JSON整形ツール、VAPIDキー生成ツールを提供し、コピーしやすい形式への変換やデータ整形、Web Push設定に必要な鍵生成をすばやく行えます。すべての処理はブラウザ内で完結し、入力データは外部送信されません。PWA対応でオフライン環境でも利用できます。',
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
      description:
        '乗り換え案内のテキストから必要な情報を抽出し、メモやチャットに貼り付けやすい形式へ変換します。',
      icon: <TrainIcon sx={{ fontSize: 48 }} />,
      href: '/transit-converter',
      category: '変換ツール',
    },
    {
      id: 'json-formatter',
      title: 'JSON 整形ツール',
      description:
        'JSONの整形・圧縮・検証を1画面で実行できます。APIレスポンスや設定データの確認作業を効率化します。',
      icon: <DataObjectIcon sx={{ fontSize: 48 }} />,
      href: '/json-formatter',
      category: '変換ツール',
    },
    {
      id: 'vapid-generator',
      title: 'VAPID キー生成ツール',
      description:
        'Web Push 通知で必要な VAPID の公開鍵・秘密鍵ペアを生成し、そのままコピーして設定に利用できます。',
      icon: <KeyIcon sx={{ fontSize: 48 }} />,
      href: '/vapid-generator',
      category: '開発支援ツール',
    },
  ];

  return (
    <>
      <script type="application/ld+json">{toJsonLd(homeStructuredData)}</script>
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom align="center">
          Tools - 便利なツール集
        </Typography>

        {/* サイトの概要説明 */}
        <Box sx={{ mb: 6, mt: 3 }}>
          <Typography variant="body1" paragraph align="center" sx={{ fontSize: '1.1rem' }}>
            Toolsは、日常作業で頻繁に発生する「整形」「変換」「検証」を素早く行うための無料ツール集です。
            乗り換え変換ツールでは経路情報を読みやすく整理し、JSON整形ツールではデータの整形・圧縮・検証を行えます。
            VAPIDキー生成ツールではWeb Push通知の実装に必要な鍵ペアをすぐに用意できます。
          </Typography>
          <Typography variant="body1" paragraph align="center" sx={{ fontSize: '1.1rem' }}>
            すべてのツールはブラウザ内で動作し、入力データは外部に送信されません。
            開発者だけでなく、日常的にテキストやデータを扱うすべての方が安全かつ手軽に利用できます。
          </Typography>
          <Typography variant="body1" paragraph align="center" sx={{ fontSize: '1.1rem' }}>
            PWA（Progressive Web App）としてホーム画面に追加すれば、アプリのようにすぐ起動できます。
            通信が不安定な環境でも基本機能を利用でき、外出先での作業にも適しています。
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
    </>
  );
}
