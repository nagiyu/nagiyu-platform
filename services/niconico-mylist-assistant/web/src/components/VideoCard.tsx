'use client';

import {
  Card,
  CardMedia,
  CardContent,
  Typography,
  Chip,
  Box,
  IconButton,
  Tooltip,
} from '@mui/material';
import { Favorite, FavoriteBorder, RemoveCircle, RemoveCircleOutline } from '@mui/icons-material';
import type { VideoData } from '@nagiyu/niconico-mylist-assistant-core';

interface VideoCardProps {
  video: VideoData;
  onToggleFavorite?: (videoId: string, isFavorite: boolean) => void;
  onToggleSkip?: (videoId: string, isSkip: boolean) => void;
}

const ERROR_MESSAGES = {
  IMAGE_LOAD_ERROR: '画像の読み込みに失敗しました',
} as const;

/**
 * 動画カードコンポーネント
 *
 * サムネイル、タイトル、投稿日時、お気に入り・スキップ状態を表示します。
 */
export default function VideoCard({ video, onToggleFavorite, onToggleSkip }: VideoCardProps) {
  const isFavorite = video.userSetting?.isFavorite ?? false;
  const isSkip = video.userSetting?.isSkip ?? false;

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  const formatLength = (lengthString: string): string => {
    // MM:SS または HH:MM:SS 形式
    return lengthString;
  };

  const handleFavoriteClick = () => {
    if (onToggleFavorite) {
      onToggleFavorite(video.videoId, !isFavorite);
    }
  };

  const handleSkipClick = () => {
    if (onToggleSkip) {
      onToggleSkip(video.videoId, !isSkip);
    }
  };

  return (
    <Card
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        opacity: isSkip ? 0.6 : 1,
        transition: 'opacity 0.2s',
      }}
    >
      <CardMedia
        component="img"
        height="180"
        image={video.thumbnailUrl}
        alt={video.title}
        loading="lazy"
        sx={{
          objectFit: 'cover',
          backgroundColor: 'grey.200',
        }}
        onError={(e) => {
          const target = e.target as HTMLImageElement;
          target.alt = ERROR_MESSAGES.IMAGE_LOAD_ERROR;
        }}
      />
      <CardContent sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Typography
          variant="subtitle1"
          component="h3"
          sx={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            lineHeight: 1.4,
            minHeight: '2.8em',
          }}
        >
          {video.title}
        </Typography>

        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          <Chip label={formatLength(video.length)} size="small" variant="outlined" />
          <Typography variant="caption" color="text.secondary">
            {formatDate(video.createdAt)}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 0.5, mt: 'auto' }}>
          <Tooltip title={isFavorite ? 'お気に入り解除' : 'お気に入りに追加'}>
            <IconButton
              size="small"
              onClick={handleFavoriteClick}
              color={isFavorite ? 'error' : 'default'}
              aria-label={isFavorite ? 'お気に入り解除' : 'お気に入りに追加'}
            >
              {isFavorite ? <Favorite /> : <FavoriteBorder />}
            </IconButton>
          </Tooltip>
          <Tooltip title={isSkip ? 'スキップ解除' : 'スキップに設定'}>
            <IconButton
              size="small"
              onClick={handleSkipClick}
              color={isSkip ? 'warning' : 'default'}
              aria-label={isSkip ? 'スキップ解除' : 'スキップに設定'}
            >
              {isSkip ? <RemoveCircle /> : <RemoveCircleOutline />}
            </IconButton>
          </Tooltip>
        </Box>
      </CardContent>
    </Card>
  );
}
