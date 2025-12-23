import { Container, Typography, Grid } from '@mui/material';
import TrainIcon from '@mui/icons-material/Train';
import ToolCard from '@/components/tools/ToolCard';
import { Tool } from '@/types/tools';

export default function HomePage() {
  const tools: Tool[] = [
    {
      id: 'transit-converter',
      title: '乗り換え変換ツール',
      description: '乗り換え案内のテキストを整形してコピーします',
      icon: <TrainIcon sx={{ fontSize: 48 }} />,
      href: '/transit-converter',
      category: '変換ツール',
    },
  ];

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom align="center">
        ツール一覧
      </Typography>

      <Grid container spacing={3} sx={{ mt: 2 }}>
        {tools.map((tool) => (
          <Grid size={{ xs: 12, sm: 6, md: 4 }} key={tool.id}>
            <ToolCard {...tool} />
          </Grid>
        ))}
      </Grid>
    </Container>
  );
}
