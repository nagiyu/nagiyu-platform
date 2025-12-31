import { signIn } from '@/lib/auth/auth';
import { Box, Button, Container, Paper, Typography } from '@mui/material';
import GoogleIcon from '@mui/icons-material/Google';

export default function SignInPage() {
  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Paper
          elevation={3}
          sx={{
            p: 4,
            width: '100%',
            textAlign: 'center',
          }}
        >
          <Typography variant="h4" component="h1" gutterBottom>
            Auth サービス
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
            nagiyu プラットフォームにサインイン
          </Typography>
          <form
            action={async () => {
              'use server';
              await signIn('google', {
                redirectTo: '/dashboard',
              });
            }}
          >
            <Button
              type="submit"
              variant="contained"
              size="large"
              startIcon={<GoogleIcon />}
              fullWidth
            >
              Google でサインイン
            </Button>
          </form>
        </Paper>
      </Box>
    </Container>
  );
}
