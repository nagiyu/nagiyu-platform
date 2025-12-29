import { Container, Typography, Button, Box, Paper } from '@mui/material';
import LoginIcon from '@mui/icons-material/Login';
import { signIn } from '@/lib/auth/auth';

export default function SignInPage() {
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
          プラットフォームにサインインするには、
          <br />
          Google アカウントでログインしてください。
        </Typography>

        <form
          action={async () => {
            'use server';
            await signIn('google', { redirectTo: '/dashboard' });
          }}
        >
          <Button
            type="submit"
            variant="contained"
            size="large"
            startIcon={<LoginIcon />}
            sx={{ mt: 2 }}
          >
            Google でサインイン
          </Button>
        </form>
      </Paper>
    </Container>
  );
}
