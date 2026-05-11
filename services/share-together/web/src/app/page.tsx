import Link from 'next/link';
import { Box, Stack, Typography } from '@mui/material';
import { Button } from '@nagiyu/ui';

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
          <Button asChild variant="solid">
            <Link href="/lists">リストを開く</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/groups">グループを管理</Link>
          </Button>
        </Stack>
      </Box>
    </main>
  );
}
