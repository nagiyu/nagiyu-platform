import type { Metadata } from 'next';
import { Container, Typography, Box, Link } from '@mui/material';
import { AUTHOR } from '@/lib/author';

export const metadata: Metadata = {
  title: 'nagiyu について',
  description:
    'nagiyu は個人開発者が提供する Web サービス群のポータルサイトです。Tools・Quick Clip・Codec Converter など多彩なサービスを無料で提供しています。開発者プロフィール・運営方針・編集ポリシー・お問い合わせをご紹介します。',
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
        <Typography variant="body1" sx={{ mb: 2 }}>
          nagiyu は、個人開発者が提供する各種 Web サービスのポータルサイトです。 Tools・Quick
          Clip・Codec Converter・Stock Tracker
          をはじめとする便利なサービスのドキュメント・使い方ガイド・技術記事を掲載しています。
        </Typography>
        <Typography variant="body1" sx={{ mb: 2 }}>
          各サービスのドキュメントはサービスの機能追加・変更に合わせて随時更新しています。
          技術記事ではサービス開発で得た知見・アーキテクチャ解説を公開しています。
        </Typography>
      </Box>

      <Box sx={{ mb: 4 }}>
        <Typography variant="h6" component="h2" gutterBottom sx={{ fontWeight: 600 }}>
          開発者プロフィール
        </Typography>
        <Typography variant="body1" sx={{ mb: 2 }}>
          {AUTHOR.name}（個人開発者）
        </Typography>
        <Typography variant="body1" sx={{ mb: 2 }}>
          モノレポ構成のプラットフォーム「nagiyu-platform」として複数の Web
          サービスを開発・運用しています。
          AWS（ECS・Lambda・CloudFront・Batch）を活用したサーバーレスアーキテクチャを採用し、
          Next.js・TypeScript を中心としたモダンな技術スタックで構築しています。
          技術記事は実装した内容を一次情報として執筆しており、すべて自身の運用経験に基づいています。
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
          運営方針
        </Typography>
        <Typography variant="body1" sx={{ mb: 2 }}>
          nagiyu-platform
          は個人開発のサイドプロジェクトとして長期的な運用を前提に設計しており、サービス・コンテンツともに継続的に更新します。
          各サービスは無料で公開し、運営費用は AdSense による広告収益で賄うことを目指しています。
        </Typography>
        <Box component="ul" sx={{ pl: 3 }}>
          <Box component="li" sx={{ mb: 1 }}>
            <Typography variant="body1">
              <strong>サービスドキュメント</strong> - 機能追加・変更の都度、概要・使い方ガイド・FAQ
              を更新します
            </Typography>
          </Box>
          <Box component="li" sx={{ mb: 1 }}>
            <Typography variant="body1">
              <strong>技術記事</strong> -
              開発・運用で得た知見をテーマ別に公開します。記事一覧は計画的に拡充していきます
            </Typography>
          </Box>
          <Box component="li" sx={{ mb: 1 }}>
            <Typography variant="body1">
              <strong>無料提供</strong> - すべてのサービスは原則無料で利用できます
            </Typography>
          </Box>
        </Box>
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
              <strong>Next.js 16</strong> - App Router・SSG による高速な静的サイト生成
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
          編集ポリシー
        </Typography>
        <Box component="ul" sx={{ pl: 3 }}>
          <Box component="li" sx={{ mb: 1 }}>
            <Typography variant="body1">
              技術記事は、実際に nagiyu-platform
              で実装・運用した内容に基づいて執筆します。検証していない手法や未検証の構成は記事化しません。
            </Typography>
          </Box>
          <Box component="li" sx={{ mb: 1 }}>
            <Typography variant="body1">
              記事の誤りに気づいた場合や、ライブラリ・フレームワークのバージョンアップで内容が古くなった場合は、フロントマターの{' '}
              <code>updatedAt</code> を更新したうえで本文を改訂します。
            </Typography>
          </Box>
          <Box component="li" sx={{ mb: 1 }}>
            <Typography variant="body1">
              生成 AI
              を執筆補助に用いる場合も、最終的な技術内容は実装・動作確認に基づき責任を持って公開します。
            </Typography>
          </Box>
          <Box component="li" sx={{ mb: 1 }}>
            <Typography variant="body1">
              広告は Google AdSense
              のみを使用し、記事内容と広告配信は分離します。広告主からの編集介入は受けません。
            </Typography>
          </Box>
        </Box>
      </Box>

      <Box sx={{ mb: 4 }}>
        <Typography variant="h6" component="h2" gutterBottom sx={{ fontWeight: 600 }}>
          お問い合わせ
        </Typography>
        <Typography variant="body1" sx={{ mb: 2 }}>
          記事の誤り報告・サービスの不具合報告・改善要望などは、GitHub Issues
          からご連絡ください。技術的な質問・議論にも対応します。
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Issues:{' '}
          <Link
            href="https://github.com/nagiyu/nagiyu-platform/issues"
            target="_blank"
            rel="noopener noreferrer"
          >
            github.com/nagiyu/nagiyu-platform/issues
          </Link>
        </Typography>
      </Box>

      <Box sx={{ mb: 4 }}>
        <Typography variant="h6" component="h2" gutterBottom sx={{ fontWeight: 600 }}>
          プライバシーとセキュリティ
        </Typography>
        <Typography variant="body1" sx={{ mb: 2 }}>
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
