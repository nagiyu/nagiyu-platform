'use client';

import { Box, Container, Typography, Button } from '@mui/material';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import RefreshIcon from '@mui/icons-material/Refresh';

export default function OfflinePage() {
  return (
    <Container>
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          textAlign: 'center',
          gap: 3,
        }}
      >
        <WifiOffIcon sx={{ fontSize: 80, color: 'text.secondary' }} />
        
        <Typography variant="h4" component="h1" gutterBottom>
          オフラインです
        </Typography>
        
        <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 600 }}>
          インターネット接続が利用できません。
          <br />
          接続を確認してから、もう一度お試しください。
        </Typography>
        
        <Button
          variant="contained"
          startIcon={<RefreshIcon />}
          onClick={() => window.location.reload()}
          sx={{ mt: 2 }}
        >
          再読み込み
        </Button>
      </Box>
    </Container>
  );
}
