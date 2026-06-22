import type { Metadata } from 'next';
import { Container, Typography, Box } from '@mui/material';
import { Link } from '@nagiyu/ui';
import AboutProfile from '@/components/AboutProfile';
import AboutTimeline from '@/components/AboutTimeline';
import AboutPolicy from '@/components/AboutPolicy';

export const metadata: Metadata = {
  title: 'nagiyu について',
  description:
    'nagiyu は、AWS・Next.js を中心とした個人開発の実運用経験を一次情報として発信する技術メディアです。運営者プロフィール・運営方針・編集ポリシー・お問い合わせをご紹介します。',
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

      {/* サイトの目的 */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h6" component="h2" gutterBottom sx={{ fontWeight: 600 }}>
          サイトの目的
        </Typography>
        <Typography variant="body1" sx={{ mb: 2 }}>
          nagiyu は、AWS・Next.js
          を中心としたフルスタック開発の実運用経験を、一次情報として記録・公開する個人技術メディアです。
          クラウドインフラ・アプリケーション設計・運用で実際に直面した課題と、その解決にあたっての判断過程を技術記事として掲載しています。
        </Typography>
        <Typography variant="body1" sx={{ mb: 2 }}>
          私が個人開発で設計・実装・運用しているプロダクト群は、こうした記事の一次情報の源泉です。
          記事はすべて自分の実装・運用経験に基づいており、検証していない内容は掲載しません。
        </Typography>
      </Box>

      {/* 運営者プロフィール（コンポーネント） */}
      <AboutProfile />

      {/* 運営期間・歴史（コンポーネント） */}
      <AboutTimeline />

      {/* 運営方針（コンポーネント） */}
      <AboutPolicy />

      {/* 技術スタック */}
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
              <strong>Material-UI (MUI) v9</strong> - Google Material Design に準拠した UI
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

      {/* 編集ポリシー */}
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

      {/* お問い合わせ */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h6" component="h2" gutterBottom sx={{ fontWeight: 600 }}>
          お問い合わせ
        </Typography>
        <Typography variant="body1" sx={{ mb: 2 }}>
          記事の誤り報告・改善要望・技術的な質問などは、GitHub Issues
          からご連絡ください。記事の内容に関する議論にも対応します。
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

      {/* プライバシーとセキュリティ */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h6" component="h2" gutterBottom sx={{ fontWeight: 600 }}>
          プライバシーとセキュリティ
        </Typography>
        <Typography variant="body1" sx={{ mb: 2 }}>
          ユーザーのプライバシーを最優先に考えています。外部サービスの利用は Google AdSense
          による広告配信のみです。
        </Typography>
        <Typography variant="body2" color="text.secondary">
          詳細は <Link href="/privacy">プライバシーポリシー</Link> をご確認ください。
        </Typography>
      </Box>
    </Container>
  );
}
