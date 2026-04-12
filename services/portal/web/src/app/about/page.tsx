import type { Metadata } from 'next';
import { Container, Typography, Box, Link } from '@mui/material';

export const metadata: Metadata = {
  title: 'nagiyu について',
  description:
    'nagiyu は個人開発者が提供する Web サービス群のポータルサイトです。Tools・Quick Clip・Codec Converter など多彩なサービスを無料で提供しています。開発者プロフィール・技術スタック・サービス一覧をご紹介します。',
  alternates: {
    canonical: 'https://nagiyu.com/about',
  },
};

export default function AboutPage() {
  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom align="center">
        nagiyu について
      </Typography>

      <Box sx={{ mb: 4 }}>
        <Typography variant="h6" component="h2" gutterBottom sx={{ fontWeight: 600 }}>
          サイトの目的
        </Typography>
        <Typography variant="body1" paragraph>
          nagiyu は、個人開発者が提供する各種 Web サービスのポータルサイトです。 Tools・Quick
          Clip・Codec Converter・Stock Tracker
          をはじめとする便利なサービスのドキュメント・使い方ガイド・技術記事を掲載しています。
        </Typography>
        <Typography variant="body1" paragraph>
          各サービスのドキュメントはサービスの機能追加・変更に合わせて随時更新しています。
          技術記事ではサービス開発で得た知見・アーキテクチャ解説を公開しています。
        </Typography>
      </Box>

      <Box sx={{ mb: 4 }}>
        <Typography variant="h6" component="h2" gutterBottom sx={{ fontWeight: 600 }}>
          開発者プロフィール
        </Typography>
        <Typography variant="body1" paragraph>
          なぎゆー（個人開発者）
        </Typography>
        <Typography variant="body1" paragraph>
          モノレポ構成のプラットフォーム「nagiyu-platform」として複数の Web
          サービスを開発・運用しています。
          AWS（ECS・Lambda・CloudFront・Batch）を活用したサーバーレスアーキテクチャを採用し、
          Next.js・TypeScript を中心としたモダンな技術スタックで構築しています。
        </Typography>
        <Typography variant="body2" color="text.secondary">
          GitHub:{' '}
          <Link
            href="https://github.com/nagiyu/nagiyu-platform"
            target="_blank"
            rel="noopener noreferrer"
          >
            nagiyu/nagiyu-platform
          </Link>
        </Typography>
      </Box>

      <Box sx={{ mb: 4 }}>
        <Typography variant="h6" component="h2" gutterBottom sx={{ fontWeight: 600 }}>
          提供サービス
        </Typography>
        <Box component="ul" sx={{ pl: 3 }}>
          <Box component="li" sx={{ mb: 2 }}>
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              Tools
            </Typography>
            <Typography variant="body2" color="text.secondary">
              乗り換え変換・JSON 整形・VAPID キー生成・Base64・URL
              エンコード・ハッシュ生成など、日常作業を効率化する無料のブラウザ完結型ツール集。
            </Typography>
          </Box>
          <Box component="li" sx={{ mb: 2 }}>
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              Quick Clip
            </Typography>
            <Typography variant="body2" color="text.secondary">
              動画のクリップ・ハイライト自動生成サービス。AWS Batch
              を活用したサーバーレス処理で大容量動画に対応。
            </Typography>
          </Box>
          <Box component="li" sx={{ mb: 2 }}>
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              Codec Converter
            </Typography>
            <Typography variant="body2" color="text.secondary">
              動画・音声コーデック変換サービス。H.264・VP9・AV1 など各種フォーマットへの変換に対応。
            </Typography>
          </Box>
          <Box component="li" sx={{ mb: 2 }}>
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              Stock Tracker
            </Typography>
            <Typography variant="body2" color="text.secondary">
              株価追跡・通知サービス。Web Push 通知で設定した価格帯に達したときにリアルタイム通知。
            </Typography>
          </Box>
          <Box component="li" sx={{ mb: 2 }}>
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              niconico-mylist-assistant
            </Typography>
            <Typography variant="body2" color="text.secondary">
              ニコニコ動画のマイリスト管理を補助するサービス。
            </Typography>
          </Box>
          <Box component="li" sx={{ mb: 2 }}>
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              Share Together
            </Typography>
            <Typography variant="body2" color="text.secondary">
              共有リストを簡単に作成・管理できるサービス。
            </Typography>
          </Box>
        </Box>
      </Box>

      <Box sx={{ mb: 4 }}>
        <Typography variant="h6" component="h2" gutterBottom sx={{ fontWeight: 600 }}>
          技術スタック
        </Typography>
        <Box component="ul" sx={{ pl: 3 }}>
          <Box component="li" sx={{ mb: 1 }}>
            <Typography variant="body1">
              <strong>Next.js 15</strong> - App Router・SSG による高速な静的サイト生成
            </Typography>
          </Box>
          <Box component="li" sx={{ mb: 1 }}>
            <Typography variant="body1">
              <strong>TypeScript strict mode</strong> - 型安全なコードで品質を維持
            </Typography>
          </Box>
          <Box component="li" sx={{ mb: 1 }}>
            <Typography variant="body1">
              <strong>Material-UI (MUI) v7</strong> - Google Material Design に準拠した UI
            </Typography>
          </Box>
          <Box component="li" sx={{ mb: 1 }}>
            <Typography variant="body1">
              <strong>AWS（ECS・Lambda・CloudFront・Batch・ECR）</strong> -
              スケーラブルなクラウドインフラ
            </Typography>
          </Box>
          <Box component="li" sx={{ mb: 1 }}>
            <Typography variant="body1">
              <strong>gray-matter + remark/rehype</strong> - Markdown
              コンテンツのフロントマター解析・HTML 変換
            </Typography>
          </Box>
        </Box>
      </Box>

      <Box sx={{ mb: 4 }}>
        <Typography variant="h6" component="h2" gutterBottom sx={{ fontWeight: 600 }}>
          プライバシーとセキュリティ
        </Typography>
        <Typography variant="body1" paragraph>
          ユーザーのプライバシーを最優先に考えています。 Google Analytics
          による匿名のアクセス統計と、Google AdSense による広告配信のみ行っています。
        </Typography>
        <Typography variant="body2" color="text.secondary">
          詳細は <Link href="/privacy">プライバシーポリシー</Link> をご確認ください。
        </Typography>
      </Box>
    </Container>
  );
}
