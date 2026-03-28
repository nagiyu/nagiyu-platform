import { Container, Paper, Typography } from '@mui/material';

export default function Home() {
  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Paper sx={{ p: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          QuickClip
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Phase 1 では基盤のみを提供します。画面機能は Phase 2 で実装予定です。
        </Typography>
      </Paper>
    </Container>
  );
}
