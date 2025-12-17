import { Container, Typography, Box } from '@mui/material';

export default function HomePage() {
  return (
    <Container maxWidth="md">
      <Box sx={{ textAlign: 'center', mt: 8 }}>
        <Typography variant="h3" component="h1" gutterBottom>
          Hello World
        </Typography>
        <Typography variant="h5" color="text.secondary">
          Tools アプリケーション（開発中）
        </Typography>
      </Box>
    </Container>
  );
}
