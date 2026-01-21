'use client';

import { useState, useEffect } from 'react';
import {
  Container,
  Box,
  Typography,
  Grid,
  Card,
  CardMedia,
  CardContent,
  CardActions,
  Button,
  Chip,
  ToggleButtonGroup,
  ToggleButton,
  CircularProgress,
  Alert,
  Pagination,
} from '@mui/material';
import { Favorite, Block } from '@mui/icons-material';
import { useRouter } from 'next/navigation';
import type { Video } from '@nagiyu/niconico-mylist-assistant-core';

type FilterType = 'all' | 'favorite' | 'skip';

export default function VideosPage() {
  const router = useRouter();
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const fetchVideos = async (filterType: FilterType, token?: string) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        filter: filterType,
        limit: '20',
      });

      if (token) {
        params.append('lastEvaluatedKey', token);
      }

      const response = await fetch(`/api/videos?${params}`);

      if (!response.ok) {
        throw new Error('動画一覧の取得に失敗しました');
      }

      const data = await response.json();
      setVideos(data.videos);
      setNextToken(data.nextToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVideos(filter);
    setPage(1);
  }, [filter]);

  const handleFilterChange = (
    _event: React.MouseEvent<HTMLElement>,
    newFilter: FilterType | null
  ) => {
    if (newFilter !== null) {
      setFilter(newFilter);
    }
  };

  const handlePageChange = (_event: React.ChangeEvent<unknown>, value: number) => {
    setPage(value);
    // 実際のページネーションは nextToken を使って実装
    // ここでは簡易的な実装
    if (value > page && nextToken) {
      fetchVideos(filter, nextToken);
    }
  };

  return (
    <Container maxWidth="lg">
      <Box sx={{ my: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          動画一覧
        </Typography>

        <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
          <ToggleButtonGroup
            value={filter}
            exclusive
            onChange={handleFilterChange}
            aria-label="filter"
          >
            <ToggleButton value="all" aria-label="all">
              すべて
            </ToggleButton>
            <ToggleButton value="favorite" aria-label="favorite">
              お気に入り
            </ToggleButton>
            <ToggleButton value="skip" aria-label="skip">
              スキップ
            </ToggleButton>
          </ToggleButtonGroup>

          <Button variant="contained" onClick={() => router.push('/import')}>
            動画を追加
          </Button>
        </Box>

        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
            <CircularProgress />
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {!loading && videos.length === 0 && (
          <Alert severity="info">動画が登録されていません</Alert>
        )}

        <Grid container spacing={3}>
          {videos.map((video) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={video.videoId}>
              <Card>
                <CardMedia
                  component="img"
                  height="140"
                  image={video.thumbnailUrl}
                  alt={video.title}
                />
                <CardContent>
                  <Typography variant="h6" component="div" noWrap>
                    {video.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" noWrap>
                    {video.videoId}
                  </Typography>
                  <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    {video.isFavorite && (
                      <Chip
                        icon={<Favorite />}
                        label="お気に入り"
                        size="small"
                        color="error"
                      />
                    )}
                    {video.isSkip && (
                      <Chip
                        icon={<Block />}
                        label="スキップ"
                        size="small"
                      />
                    )}
                  </Box>
                </CardContent>
                <CardActions>
                  <Button
                    size="small"
                    onClick={() => router.push(`/videos/${video.videoId}`)}
                  >
                    詳細
                  </Button>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>

        {videos.length > 0 && (
          <Box sx={{ mt: 4, display: 'flex', justifyContent: 'center' }}>
            <Pagination
              count={nextToken ? page + 1 : page}
              page={page}
              onChange={handlePageChange}
              color="primary"
            />
          </Box>
        )}
      </Box>
    </Container>
  );
}
