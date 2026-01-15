import { Container, Typography, Box } from '@mui/material';

export default function Home() {
  return (
    <Container maxWidth="lg">
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        <Typography variant="h2" component="h1" gutterBottom>
          Stock Tracker
        </Typography>
        <Typography variant="h5" color="text.secondary" paragraph>
          リアルタイム株価監視とアラート通知
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Phase 0: Webパッケージ初期セットアップ完了
        </Typography>
      </Box>
    </Container>
  );
}
