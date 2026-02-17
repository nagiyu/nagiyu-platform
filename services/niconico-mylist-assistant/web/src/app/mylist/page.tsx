import { Container, Typography, Box } from '@mui/material';
import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import VideoList from '@/components/VideoList';

/**
 * 動画管理ページ
 *
 * 動画一覧を表示し、お気に入り・スキップの管理を行います。
 */
export default async function MylistPage() {
  const session = await getSession();

  if (!session?.user) {
    redirect('/');
  }

  return (
    <Container maxWidth="lg">
      <Box sx={{ my: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          動画管理
        </Typography>
        <Typography variant="body1" color="text.secondary" paragraph>
          動画の一覧を表示し、お気に入りやスキップの設定ができます。
        </Typography>
        <VideoList />
      </Box>
    </Container>
  );
}
