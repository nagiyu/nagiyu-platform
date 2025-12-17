import {
  Card,
  CardContent,
  CardActionArea,
  Typography,
  Box,
  Chip,
} from '@mui/material';
import { ReactNode } from 'react';

interface ToolCardProps {
  title: string;
  description: string;
  icon: ReactNode;
  href: string;
  category?: string;
}

export default function ToolCard({
  title,
  description,
  icon,
  href,
  category,
}: ToolCardProps) {
  return (
    <Card>
      <CardActionArea href={href}>
        <CardContent>
          {/* アイコン */}
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              height: 80,
              mb: 2,
              color: 'primary.main',
            }}
          >
            {icon}
          </Box>

          {/* タイトル */}
          <Typography variant="h6" component="h2" gutterBottom align="center">
            {title}
          </Typography>

          {/* 説明 */}
          <Typography variant="body2" color="text.secondary" align="center">
            {description}
          </Typography>

          {/* カテゴリ（将来実装） */}
          {category && (
            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
              <Chip label={category} size="small" />
            </Box>
          )}
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
