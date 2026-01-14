import { Container, Typography, Box } from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';

export default function HomePage() {
  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ textAlign: 'center', mb: 4 }}>
        <TrendingUpIcon sx={{ fontSize: 64, color: 'primary.main', mb: 2 }} />
        <Typography variant="h3" component="h1" gutterBottom>
          Stock Tracker
        </Typography>
        <Typography variant="h6" component="p" color="text.secondary">
          株価追跡・通知サービス
        </Typography>
      </Box>

      <Box sx={{ mt: 4 }}>
        <Typography variant="body1" paragraph>
          Stock Trackerは、リアルタイムな株価データの可視化と条件ベースのアラート通知を提供するサービスです。
        </Typography>
        <Typography variant="body1" paragraph>
          開発中...
        </Typography>
      </Box>
    </Container>
  );
}
