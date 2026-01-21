'use client';

import { useState, useEffect } from 'react';
import {
  Container,
  Box,
  Typography,
  Card,
  CardMedia,
  CardContent,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
} from '@mui/material';
import { Favorite, FavoriteBorder, Block } from '@mui/icons-material';
import { useRouter } from 'next/navigation';
import type { Video } from '@nagiyu/niconico-mylist-assistant-core';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function VideoDetailPage({ params }: PageProps) {
  const router = useRouter();
  const [videoId, setVideoId] = useState<string>('');
  const [video, setVideo] = useState<Video | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [isSkip, setIsSkip] = useState(false);
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  useEffect(() => {
    params.then((p) => {
      setVideoId(p.id);
      fetchVideo(p.id);
    });
  }, []);

  const fetchVideo = async (id: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/videos/${id}`);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('動画が見つかりません');
        }
        throw new Error('動画の取得に失敗しました');
      }

      const data = await response.json();
      setVideo(data.video);
      setIsFavorite(data.video.isFavorite);
      setIsSkip(data.video.isSkip);
      setMemo(data.video.memo || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!video) return;

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/videos/${video.videoId}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          isFavorite,
          isSkip,
          memo,
        }),
      });

      if (!response.ok) {
        throw new Error('設定の保存に失敗しました');
      }

      const data = await response.json();
      setVideo(data.video);

      // 成功メッセージ（オプション）
      alert('設定を保存しました');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!video) return;

    try {
      const response = await fetch(`/api/videos/${video.videoId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('動画の削除に失敗しました');
      }

      router.push('/videos');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
      setDeleteDialogOpen(false);
    }
  };

  if (loading) {
    return (
      <Container maxWidth="md">
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (error && !video) {
    return (
      <Container maxWidth="md">
        <Alert severity="error" sx={{ mt: 4 }}>
          {error}
        </Alert>
        <Button onClick={() => router.push('/videos')} sx={{ mt: 2 }}>
          動画一覧に戻る
        </Button>
      </Container>
    );
  }

  if (!video) return null;

  return (
    <Container maxWidth="md">
      <Box sx={{ my: 4 }}>
        <Button onClick={() => router.push('/videos')} sx={{ mb: 2 }}>
          ← 一覧に戻る
        </Button>

        <Card>
          <CardMedia
            component="img"
            height="300"
            image={video.thumbnailUrl}
            alt={video.title}
          />
          <CardContent>
            <Typography variant="h5" component="h1" gutterBottom>
              {video.title}
            </Typography>

            <Typography variant="body2" color="text.secondary" gutterBottom>
              動画 ID: {video.videoId}
            </Typography>

            <Box sx={{ my: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Chip label={`再生: ${video.viewCount?.toLocaleString()}`} />
              <Chip label={`コメント: ${video.commentCount?.toLocaleString()}`} />
              <Chip label={`マイリスト: ${video.mylistCount?.toLocaleString()}`} />
            </Box>

            {video.description && (
              <Typography variant="body1" paragraph>
                {video.description}
              </Typography>
            )}

            {video.tags && video.tags.length > 0 && (
              <Box sx={{ my: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  タグ:
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {video.tags.map((tag) => (
                    <Chip key={tag} label={tag} size="small" variant="outlined" />
                  ))}
                </Box>
              </Box>
            )}

            <Box sx={{ mt: 3 }}>
              <Typography variant="h6" gutterBottom>
                設定
              </Typography>

              <Box sx={{ mb: 2 }}>
                <Button
                  variant={isFavorite ? 'contained' : 'outlined'}
                  color="error"
                  startIcon={isFavorite ? <Favorite /> : <FavoriteBorder />}
                  onClick={() => setIsFavorite(!isFavorite)}
                >
                  {isFavorite ? 'お気に入り' : 'お気に入りに追加'}
                </Button>

                <Button
                  variant={isSkip ? 'contained' : 'outlined'}
                  sx={{ ml: 2 }}
                  startIcon={<Block />}
                  onClick={() => setIsSkip(!isSkip)}
                >
                  {isSkip ? 'スキップ中' : 'スキップ'}
                </Button>
              </Box>

              <TextField
                fullWidth
                multiline
                rows={4}
                label="メモ"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="この動画についてのメモを入力..."
                sx={{ mb: 2 }}
              />

              <Box sx={{ display: 'flex', gap: 2 }}>
                <Button
                  variant="contained"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? '保存中...' : '設定を保存'}
                </Button>

                <Button
                  variant="outlined"
                  color="error"
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  削除
                </Button>
              </Box>

              {error && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {error}
                </Alert>
              )}
            </Box>
          </CardContent>
        </Card>

        <Dialog
          open={deleteDialogOpen}
          onClose={() => setDeleteDialogOpen(false)}
        >
          <DialogTitle>動画を削除</DialogTitle>
          <DialogContent>
            この動画を削除してもよろしいですか？この操作は取り消せません。
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteDialogOpen(false)}>
              キャンセル
            </Button>
            <Button onClick={handleDelete} color="error">
              削除
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Container>
  );
}
