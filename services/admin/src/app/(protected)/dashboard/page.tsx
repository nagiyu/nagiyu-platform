import { Box, Typography } from '@mui/material';

export default function DashboardPage() {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        ダッシュボード
      </Typography>
      <Typography variant="body1" sx={{ mt: 2 }}>
        Admin サービスが正常に動作しています。
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
        JWT 検証機能は次のタスクで実装されます。
      </Typography>
    </Box>
  );
}
