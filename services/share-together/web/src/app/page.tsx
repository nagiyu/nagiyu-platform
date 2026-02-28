import { Box, Typography } from '@mui/material';
import { Navigation } from '@/components/Navigation';
import { TodoList } from '@/components/TodoList';

export default function Home() {
  return (
    <main>
      <Navigation />
      <Box component="section" sx={{ p: 2, maxWidth: 720, mx: 'auto' }}>
        <Typography variant="h5" component="h1" sx={{ mb: 2 }}>
          デフォルト個人リスト
        </Typography>
        <TodoList />
      </Box>
    </main>
  );
}
