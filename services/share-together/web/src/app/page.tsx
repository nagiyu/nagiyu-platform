'use client';

import { Box, Button, Stack, Typography } from '@mui/material';

export default function Home() {
  return (
    <main>
      <Box component="section" sx={{ p: 2, maxWidth: 720, mx: 'auto' }}>
        <Typography variant="h5" component="h1" sx={{ mb: 2 }}>
          Share Together へようこそ
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          個人リストと共有リストの ToDo を、用途に応じて切り替えながら管理できます。
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <Button variant="contained" href="/lists">
            リストを開く
          </Button>
          <Button variant="outlined" href="/groups">
            グループを管理
          </Button>
        </Stack>
      </Box>
    </main>
  );
}
