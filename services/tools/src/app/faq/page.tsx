import type { Metadata } from 'next';
import {
  Container,
  Typography,
  Box,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

export const metadata: Metadata = {
  title: 'よくある質問 (FAQ) - Tools',
  description: 'Tools サイトに関するよくある質問と回答',
  alternates: {
    canonical: 'https://nagiyu.com/faq',
  },
};

export default function FAQPage() {
  const faqs = [
    {
      question: 'このサイトは無料ですか？',
      answer:
        'はい、完全に無料です。すべてのツールを無料でご利用いただけます。アカウント登録や課金も一切不要です。',
    },
    {
      question: '入力したデータはどこに保存されますか？',
      answer:
        'すべてのデータはブラウザ内でのみ処理され、サーバーには送信されません。入力した情報は、ページを閉じると消去されます。表示設定などの一部の設定情報のみ、ブラウザのローカルストレージに保存されます。',
    },
    {
      question: 'オフラインで使えますか？',
      answer:
        'はい、PWA（Progressive Web App）としてインストールすることで、オフライン環境でも基本的なツールを利用できます。初回アクセス時にキャッシュされたデータを使用して動作します。',
    },
    {
      question: 'どのブラウザに対応していますか？',
      answer:
        'モダンブラウザ（Chrome、Firefox、Safari、Edgeの最新版）に対応しています。Internet Explorer 11など、古いブラウザではご利用いただけない場合があります。最適な体験のため、最新のブラウザをご使用ください。',
    },
    {
      question: 'スマートフォンで使えますか？',
      answer:
        'はい、スマートフォンやタブレットでもご利用いただけます。レスポンシブデザインに対応しており、画面サイズに応じて最適なレイアウトで表示されます。また、PWAとしてホーム画面に追加して、アプリのように使うこともできます。',
    },
    {
      question: '個人情報は収集されますか？',
      answer:
        '個人を特定できる情報は一切収集していません。Google Analytics による匿名のアクセス統計と、Google AdSense による広告配信のためのクッキーのみ使用しています。詳しくはプライバシーポリシーをご確認ください。',
    },
    {
      question: '広告が表示されるのはなぜですか？',
      answer:
        'サーバー運用費用やドメイン維持費などの運用コストを賄うため、Google AdSense による広告を表示しています。広告収益により、無料でサービスを提供し続けることができます。',
    },
    {
      question: '新しいツールのリクエストはできますか？',
      answer:
        'GitHub の Issues ページからツールのリクエストを受け付けています。ただし、個人開発のため、すべてのリクエストに対応できるとは限りません。開発者自身が必要と判断したツールを優先的に実装しています。',
    },
    {
      question: 'バグを見つけた場合はどうすればいいですか？',
      answer:
        'お手数ですが、GitHub の Issues ページからバグ報告をお願いします。または、お問い合わせフォームからご連絡ください。できる限り早く対応いたします。',
    },
    {
      question: 'ソースコードは公開されていますか？',
      answer:
        'はい、GitHub で公開しています（nagiyu/nagiyu-platform）。オープンソースプロジェクトとして、誰でもコードを閲覧できます。プルリクエストも歓迎しています。',
    },
    {
      question: 'PWAとしてインストールするにはどうすればいいですか？',
      answer:
        'ブラウザのアドレスバーに表示されるインストールアイコン（+マークやダウンロードアイコン）をクリックするか、ブラウザのメニューから「ホーム画面に追加」を選択してください。Androidの場合は「ホーム画面に追加」、iOSのSafariの場合は「共有」→「ホーム画面に追加」から追加できます。',
    },
    {
      question: '乗り換え変換ツールが対応している乗り換え案内サイトは？',
      answer:
        '主要な乗り換え案内サイト（Yahoo!乗換案内、ジョルダン、駅すぱあとなど）のテキスト形式に対応しています。ただし、サイトのフォーマット変更により動作しなくなる可能性があります。対応していないフォーマットの場合は、エラーメッセージが表示されます。',
    },
  ];

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom align="center">
        よくある質問 (FAQ)
      </Typography>

      <Typography variant="body1" color="text.secondary" paragraph align="center" sx={{ mb: 4 }}>
        Tools サイトに関するよくある質問と回答をまとめました。
        解決しない問題がある場合は、お問い合わせフォームからご連絡ください。
      </Typography>

      <Box>
        {faqs.map((faq, index) => (
          <Accordion key={index}>
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              aria-controls={`faq-${index}-content`}
              id={`faq-${index}-header`}
            >
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                Q{index + 1}. {faq.question}
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
                {faq.answer}
              </Typography>
            </AccordionDetails>
          </Accordion>
        ))}
      </Box>

      <Box sx={{ mt: 4, p: 3, bgcolor: 'grey.100', borderRadius: 1 }}>
        <Typography variant="h6" component="h2" gutterBottom>
          その他のご質問
        </Typography>
        <Typography variant="body2" paragraph>
          上記以外のご質問がある場合は、お気軽にお問い合わせください。
        </Typography>
        <Typography variant="body2">
          お問い合わせ: <a href="/contact">お問い合わせフォーム</a>
        </Typography>
        <Typography variant="body2">
          GitHub Issues:{' '}
          <a
            href="https://github.com/nagiyu/nagiyu-platform/issues"
            target="_blank"
            rel="noopener noreferrer"
          >
            https://github.com/nagiyu/nagiyu-platform/issues
          </a>
        </Typography>
      </Box>
    </Container>
  );
}
