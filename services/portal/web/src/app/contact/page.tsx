import type { Metadata } from 'next';
import { Container, Typography, Box } from '@mui/material';
import { Link, Button } from '@nagiyu/ui';
import {
  CONTACT_FORM_URL,
  GITHUB_ISSUES_URL,
  CONTACT_USE_CASES,
  CONTACT_NOTES,
} from '@/lib/contact';

export const metadata: Metadata = {
  title: 'お問い合わせ',
  description:
    'nagiyu へのお問い合わせはGoogle フォームからお気軽にどうぞ。サービスへのご意見・不具合報告・記事の誤り指摘など、幅広くお受けしています。',
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

      <Typography variant="body1" sx={{ mb: 4, textAlign: 'center', color: 'text.secondary' }}>
        ご意見・ご感想・不具合報告など、お気軽にお送りください。
      </Typography>

      {/* メイン手段: Google フォーム */}
      <Box sx={{ mb: 5 }}>
        <Typography variant="h6" component="h2" gutterBottom sx={{ fontWeight: 600 }}>
          お問い合わせフォーム
        </Typography>
        <Typography variant="body1" sx={{ mb: 3 }}>
          以下のフォームからお問い合わせいただけます。Google フォームを利用しており、 Google
          アカウントなしでもご利用いただけます。
        </Typography>
        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <Button variant="solid" asChild>
            <a href={CONTACT_FORM_URL} target="_blank" rel="noopener noreferrer">
              お問い合わせフォームを開く
            </a>
          </Button>
        </Box>
      </Box>

      {/* どんな用件で連絡してよいか */}
      <Box sx={{ mb: 5 }}>
        <Typography variant="h6" component="h2" gutterBottom sx={{ fontWeight: 600 }}>
          こんな場合にご利用ください
        </Typography>
        <Box component="ul" sx={{ pl: 3 }}>
          {CONTACT_USE_CASES.map((useCase) => (
            <Box component="li" key={useCase.title} sx={{ mb: 2 }}>
              <Typography variant="body1" sx={{ fontWeight: 600 }}>
                {useCase.title}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {useCase.description}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>

      {/* 注意事項 */}
      <Box sx={{ mb: 5 }}>
        <Typography variant="h6" component="h2" gutterBottom sx={{ fontWeight: 600 }}>
          注意事項
        </Typography>
        <Box component="ul" sx={{ pl: 3 }}>
          {CONTACT_NOTES.map((note) => (
            <Box component="li" key={note} sx={{ mb: 1 }}>
              <Typography variant="body1">{note}</Typography>
            </Box>
          ))}
        </Box>
      </Box>

      {/* 補足: GitHub Issues（技術者向け） */}
      <Box
        sx={{
          mb: 4,
          p: 2,
          backgroundColor: 'grey.100',
          borderRadius: 1,
          borderLeft: 4,
          borderColor: 'grey.400',
        }}
      >
        <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600 }}>
          技術者の方へ
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          バグ報告・機能要望・技術的な議論は{' '}
          <Link href={GITHUB_ISSUES_URL} target="_blank" rel="noopener noreferrer">
            GitHub Issues
          </Link>{' '}
          でも受け付けています。コードレベルの詳細なやりとりに適しています。
        </Typography>
      </Box>
    </Container>
  );
}
