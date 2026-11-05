import type { Metadata } from 'next';
import { Container, Typography } from '@mui/material';
import { CommercialTransactionsTable } from '@nagiyu/ui';

// プランのページは Auth にあり、URL をランタイム env から解決するため動的レンダリングにする。
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '特定商取引法に基づく表記 | さくっとクリップ',
  description: 'さくっとクリップの有料プランに関する特定商取引法に基づく表記です。',
};

export default function TokushohoPage() {
  const authUrl = (process.env.NEXT_PUBLIC_AUTH_URL ?? '').replace(/\/+$/, '');

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom align="center" sx={{ mb: 4 }}>
        特定商取引法に基づく表記
      </Typography>
      <CommercialTransactionsTable plansHref={`${authUrl}/plans`} />
    </Container>
  );
}
