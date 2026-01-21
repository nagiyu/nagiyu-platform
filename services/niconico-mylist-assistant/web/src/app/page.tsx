import { Container, Typography, Box } from '@mui/material';

export default function Home() {
  return (
    <Container maxWidth="lg">
      <Box sx={{ my: 4 }}>
        <Typography variant="h3" component="h1" gutterBottom>
          niconico-mylist-assistant
        </Typography>
        <Typography variant="body1" color="text.secondary">
          ニコニコ動画のマイリスト登録を自動化する補助ツールです。
        </Typography>
      </Box>
    </Container>
  );
}
