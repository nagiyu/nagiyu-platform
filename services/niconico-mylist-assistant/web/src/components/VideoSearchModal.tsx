'use client';

import { useState } from 'react';
import type { NiconicoVideoInfo } from '@nagiyu/niconico-mylist-assistant-core';
import {
  Box,
  Card,
  CardContent,
  CardMedia,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import { Button, ErrorAlert, TextField } from '@nagiyu/ui';
import { ERROR_MESSAGES, VALIDATION_LIMITS } from '@/lib/constants/errors';

interface VideoSearchModalProps {
  open: boolean;
  onClose: () => void;
}

type AddStatus = 'added' | 'already-added';
type SearchVideo = NiconicoVideoInfo & { isRegistered?: boolean };
interface SearchResponse {
  videos?: SearchVideo[];
  error?: string;
}

export default function VideoSearchModal({ open, onClose }: VideoSearchModalProps) {
  const [keyword, setKeyword] = useState('');
  const [videos, setVideos] = useState<SearchVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addStatusById, setAddStatusById] = useState<Record<string, AddStatus>>({});

  const handleSearch = async () => {
    setLoading(true);
    setError(null);
    setVideos([]);
    setAddStatusById({});

    try {
      const params = new URLSearchParams({ q: keyword.trim() });
      const response = await fetch(`/api/videos/search?${params.toString()}`);
      const data = (await response.json()) as SearchResponse;
      if (!response.ok) {
        throw new Error(data.error || ERROR_MESSAGES.VIDEO_SEARCH_FAILED);
      }

      const searchResults = Array.isArray(data.videos) ? data.videos : [];
      const initialAddStatus = searchResults.reduce<Record<string, AddStatus>>(
        (statusById, video) => {
          if (video.isRegistered) {
            statusById[video.videoId] = 'already-added';
          }
          return statusById;
        },
        {}
      );

      setVideos(searchResults);
      setAddStatusById(initialAddStatus);
    } catch (searchError) {
      setError(
        searchError instanceof Error ? searchError.message : ERROR_MESSAGES.VIDEO_SEARCH_FAILED
      );
    } finally {
      setLoading(false);
    }
  };

  const handleAddVideo = async (videoId: string) => {
    setError(null);
    try {
      const response = await fetch('/api/videos/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoIds: [videoId] }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || ERROR_MESSAGES.VIDEO_ADD_FAILED);
      }

      const status: AddStatus = data.skipped > 0 ? 'already-added' : 'added';
      setAddStatusById((prev) => ({ ...prev, [videoId]: status }));
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : ERROR_MESSAGES.VIDEO_ADD_FAILED);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>動画検索</DialogTitle>
      <DialogContent>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 1 }}>
          <TextField
            fullWidth
            label="検索キーワード"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            disabled={loading}
            maxLength={VALIDATION_LIMITS.SEARCH_KEYWORD_MAX_LENGTH}
          />
          <Button
            variant="solid"
            onClick={handleSearch}
            loading={loading}
            disabled={
              !keyword.trim() || keyword.trim().length > VALIDATION_LIMITS.SEARCH_KEYWORD_MAX_LENGTH
            }
          >
            検索
          </Button>
        </Stack>

        {error && <ErrorAlert message={error} sx={{ mt: 2 }} />}

        <Box sx={{ mt: 2 }}>
          {videos.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              キーワードを入力して検索してください
            </Typography>
          ) : (
            <Stack spacing={2}>
              {videos.map((video) => {
                const addStatus = addStatusById[video.videoId];

                return (
                  <Card key={video.videoId}>
                    <CardContent sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                      <CardMedia
                        component="img"
                        image={video.thumbnailUrl}
                        alt={video.title}
                        sx={{ width: 120, height: 68 }}
                      />
                      <Box sx={{ flexGrow: 1 }}>
                        <Typography variant="subtitle2">{video.title}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {video.videoId}
                        </Typography>
                      </Box>
                      <Button
                        variant={addStatus ? 'outline' : 'solid'}
                        disabled={Boolean(addStatus)}
                        onClick={() => handleAddVideo(video.videoId)}
                      >
                        {addStatus === 'already-added'
                          ? '追加済み（登録済）'
                          : addStatus === 'added'
                            ? '追加済み'
                            : '追加'}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </Stack>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="ghost">
          閉じる
        </Button>
      </DialogActions>
    </Dialog>
  );
}
