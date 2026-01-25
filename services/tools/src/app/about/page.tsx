import type { Metadata } from 'next';
import { Container, Typography, Box, Link } from '@mui/material';

export const metadata: Metadata = {
  title: 'Tools について - Tools',
  description: 'Tools サイトの概要、開発の経緯、技術スタック、提供ツールの紹介',
  alternates: {
    canonical: 'https://nagiyu.com/about',
  },
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
          開発者や一般ユーザーを問わず、誰でも無料で利用できます。
        </Typography>
        <Typography variant="body1" paragraph>
          すべてのツールはブラウザ内で動作し、入力されたデータはサーバーに送信されません。
          プライバシーを重視した設計となっており、安心してご利用いただけます。
        </Typography>
        <Typography variant="body1" paragraph>
          乗り換え案内の整形や、今後追加予定の様々なツールを通じて、
          日常的な作業をより快適にすることを目指しています。
        </Typography>
      </Box>

      <Box sx={{ mb: 4 }}>
        <Typography variant="h6" component="h2" gutterBottom sx={{ fontWeight: 600 }}>
          開発の経緯
        </Typography>
        <Typography variant="body1" paragraph>
          このサイトは、開発者自身が日常的に必要とするツールを実装することから始まりました。
          市販の乗り換え案内アプリでは、コピー時に不要な情報が多く含まれており、
          メモアプリに整形して貼り付けるのが面倒でした。
        </Typography>
        <Typography variant="body1" paragraph>
          そこで、必要な情報だけを抽出して整形するツールを作成したのがきっかけです。
          その後、同じような日常的な小さなツールを統合したプラットフォームとして発展させました。
        </Typography>
        <Typography variant="body1" paragraph>
          「自分が使いたいツールを作る」という方針で開発を進めており、
          実用性とシンプルさを重視しています。
        </Typography>
      </Box>

      <Box sx={{ mb: 4 }}>
        <Typography variant="h6" component="h2" gutterBottom sx={{ fontWeight: 600 }}>
          提供ツール
        </Typography>
        <Box component="ul" sx={{ pl: 3 }}>
          <Box component="li" sx={{ mb: 2 }}>
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              乗り換え変換ツール
            </Typography>
            <Typography variant="body2" color="text.secondary">
              乗り換え案内のテキストを整形してコピー。
              出発地、到着地、時刻、運賃などの必要な情報だけを抽出し、
              読みやすい形式に変換します。表示項目のカスタマイズも可能です。
            </Typography>
          </Box>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          今後も便利なツールを追加していく予定です。 ツールのリクエストは GitHub Issues
          で受け付けています。
        </Typography>
      </Box>

      <Box sx={{ mb: 4 }}>
        <Typography variant="h6" component="h2" gutterBottom sx={{ fontWeight: 600 }}>
          技術スタック
        </Typography>
        <Typography variant="body1" paragraph>
          モダンな技術スタックを採用し、高速で使いやすいアプリケーションを実現しています。
        </Typography>
        <Box component="ul" sx={{ pl: 3 }}>
          <Box component="li" sx={{ mb: 1 }}>
            <Typography variant="body1">
              <strong>Next.js 15</strong> - React ベースのフルスタックフレームワーク（App Router
              使用）
            </Typography>
          </Box>
          <Box component="li" sx={{ mb: 1 }}>
            <Typography variant="body1">
              <strong>TypeScript</strong> - 型安全なコードで開発効率と品質を向上
            </Typography>
          </Box>
          <Box component="li" sx={{ mb: 1 }}>
            <Typography variant="body1">
              <strong>Material-UI (MUI) v6</strong> - Google の Material Design を採用した UI
              コンポーネントライブラリ
            </Typography>
          </Box>
          <Box component="li" sx={{ mb: 1 }}>
            <Typography variant="body1">
              <strong>PWA 対応</strong> - Service Worker によるオフライン動作、ホーム画面への追加
            </Typography>
          </Box>
          <Box component="li" sx={{ mb: 1 }}>
            <Typography variant="body1">
              <strong>AWS (Lambda, CloudFront, ECR)</strong> - サーバーレスアーキテクチャで運用
            </Typography>
          </Box>
          <Box component="li" sx={{ mb: 1 }}>
            <Typography variant="body1">
              <strong>Jest, Playwright</strong> - ユニットテスト、E2E テストで品質を保証
            </Typography>
          </Box>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          すべてのコードは TypeScript strict mode で記述され、高い品質基準を維持しています。
          テストカバレッジは 80% 以上を目標としています。
        </Typography>
      </Box>

      <Box sx={{ mb: 4 }}>
        <Typography variant="h6" component="h2" gutterBottom sx={{ fontWeight: 600 }}>
          今後の展望
        </Typography>
        <Typography variant="body1" paragraph>
          今後も、日常的に便利なツールを追加していく予定です。
          現在検討中のツールには、以下のようなものがあります：
        </Typography>
        <Box component="ul" sx={{ pl: 3 }}>
          <Box component="li" sx={{ mb: 1 }}>
            <Typography variant="body2">JSON フォーマッター</Typography>
          </Box>
          <Box component="li" sx={{ mb: 1 }}>
            <Typography variant="body2">Base64 エンコーダー/デコーダー</Typography>
          </Box>
          <Box component="li" sx={{ mb: 1 }}>
            <Typography variant="body2">ハッシュ生成ツール</Typography>
          </Box>
          <Box component="li" sx={{ mb: 1 }}>
            <Typography variant="body2">URL エンコーダー/デコーダー</Typography>
          </Box>
          <Box component="li" sx={{ mb: 1 }}>
            <Typography variant="body2">タイムスタンプ変換ツール</Typography>
          </Box>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          開発者自身が使いたいツールを優先的に実装していきますが、
          ユーザーからのフィードバックやリクエストも参考にします。
        </Typography>
      </Box>

      <Box sx={{ mb: 4 }}>
        <Typography variant="h6" component="h2" gutterBottom sx={{ fontWeight: 600 }}>
          開発者
        </Typography>
        <Typography variant="body1" paragraph>
          なぎゆー（個人開発者）
        </Typography>
        <Typography variant="body1" paragraph>
          モノレポ構成のプラットフォーム「nagiyu-platform」の一部として開発しています。
          オープンソースプロジェクトとして、GitHub でソースコードを公開しています。
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

      <Box sx={{ mb: 4 }}>
        <Typography variant="h6" component="h2" gutterBottom sx={{ fontWeight: 600 }}>
          プライバシーとセキュリティ
        </Typography>
        <Typography variant="body1" paragraph>
          ユーザーのプライバシーを最優先に考えています。
          すべてのツールはブラウザ内で動作し、入力データはサーバーに送信されません。
        </Typography>
        <Typography variant="body1" paragraph>
          個人を特定できる情報は一切収集していません。 Google Analytics による匿名のアクセス統計と、
          Google AdSense による広告配信のみ行っています。
        </Typography>
        <Typography variant="body2" color="text.secondary">
          詳細は{' '}
          <Link href="/privacy" rel="noopener noreferrer">
            プライバシーポリシー
          </Link>{' '}
          をご確認ください。
        </Typography>
      </Box>
    </Container>
  );
}
