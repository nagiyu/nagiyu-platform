import type { Metadata } from 'next';
import { Container, Typography } from '@mui/material';
import { CommercialTransactionsTable } from '@nagiyu/ui';

export const metadata: Metadata = {
  title: '特定商取引法に基づく表記 | Auth',
  description: 'Nagiyu Platform の有料プランに関する特定商取引法に基づく表記です。',
};

export default function TokushohoPage() {
  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom align="center" sx={{ mb: 4 }}>
        特定商取引法に基づく表記
      </Typography>
      <CommercialTransactionsTable plansHref="/plans" />
    </Container>
  );
}
