import { Container, Typography, Button, Box, Paper } from '@mui/material';
import LoginIcon from '@mui/icons-material/Login';

export default function HomePage() {
  return (
    <Container maxWidth="sm" sx={{ py: 8 }}>
      <Paper elevation={3} sx={{ p: 4, textAlign: 'center' }}>
        <Box sx={{ mb: 3 }}>
          <LoginIcon sx={{ fontSize: 64, color: 'primary.main' }} />
        </Box>

        <Typography variant="h4" component="h1" gutterBottom>
          Nagiyu Platform
        </Typography>

        <Typography variant="h6" component="h2" color="text.secondary" gutterBottom>
          認証サービス
        </Typography>

        <Typography variant="body1" color="text.secondary" sx={{ mt: 3, mb: 4 }}>
          このページは認証サービスのトップページです。
          <br />
          サインインするには、以下のボタンをクリックしてください。
        </Typography>

        <Button variant="contained" size="large" startIcon={<LoginIcon />} disabled sx={{ mt: 2 }}>
          Google でサインイン
        </Button>

        <Typography variant="caption" display="block" sx={{ mt: 2 }} color="text.secondary">
          ※ 認証機能は次のタスクで実装予定です
        </Typography>
      </Paper>
    </Container>
  );
}
