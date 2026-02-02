'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  IconButton,
  Tooltip,
  CircularProgress,
  Alert,
  Chip,
  Stack,
} from '@mui/material';
import {
  Close,
  Favorite,
  FavoriteBorder,
  RemoveCircle,
  RemoveCircleOutline,
  Delete,
  OpenInNew,
} from '@mui/icons-material';
import type { VideoData } from '@nagiyu/niconico-mylist-assistant-core';

interface VideoDetailModalProps {
  videoId: string | null;
  open: boolean;
  onClose: () => void;
  onUpdate?: () => void;
  onDelete?: () => void;
}

const ERROR_MESSAGES = {
  FETCH_FAILED: '動画情報の取得に失敗しました',
  UPDATE_FAILED: '設定の更新に失敗しました',
  DELETE_FAILED: '動画の削除に失敗しました',
  NETWORK_ERROR: 'ネットワークエラーが発生しました',
  MEMO_TOO_LONG: 'メモは1000文字以内で入力してください',
} as const;

/**
 * 動画詳細モーダルコンポーネント
 *
 * 動画の詳細情報を表示し、お気に入り/スキップの切り替え、メモの編集、削除を行います。
 */
export default function VideoDetailModal({
  videoId,
  open,
  onClose,
  onUpdate,
  onDelete,
}: VideoDetailModalProps) {
  const [video, setVideo] = useState<VideoData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [memo, setMemo] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // 動画情報を取得
  useEffect(() => {
    if (!open || !videoId) {
      setVideo(null);
      setMemo('');
      setError(null);
      setShowDeleteConfirm(false);
      return;
    }

    const fetchVideo = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/videos/${videoId}`);

        if (!response.ok) {
          throw new Error(ERROR_MESSAGES.FETCH_FAILED);
        }

        const data = await response.json();
        setVideo(data.video);
        setMemo(data.video.userSetting?.memo || '');
      } catch (err) {
        console.error('動画情報取得エラー:', err);
        setError(err instanceof Error ? err.message : ERROR_MESSAGES.NETWORK_ERROR);
      } finally {
        setLoading(false);
      }
    };

    fetchVideo();
  }, [videoId, open]);

  // お気に入り切り替え
  const handleToggleFavorite = async () => {
    if (!video) return;

    const newValue = !video.userSetting?.isFavorite;
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/videos/${videoId}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isFavorite: newValue }),
      });

      if (!response.ok) {
        throw new Error(ERROR_MESSAGES.UPDATE_FAILED);
      }

      const data = await response.json();
      setVideo(data.video);
      onUpdate?.();
    } catch (err) {
      console.error('お気に入り更新エラー:', err);
      setError(err instanceof Error ? err.message : ERROR_MESSAGES.NETWORK_ERROR);
    } finally {
      setIsSaving(false);
    }
  };

  // スキップ切り替え
  const handleToggleSkip = async () => {
    if (!video) return;

    const newValue = !video.userSetting?.isSkip;
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/videos/${videoId}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isSkip: newValue }),
      });

      if (!response.ok) {
        throw new Error(ERROR_MESSAGES.UPDATE_FAILED);
      }

      const data = await response.json();
      setVideo(data.video);
      onUpdate?.();
    } catch (err) {
      console.error('スキップ更新エラー:', err);
      setError(err instanceof Error ? err.message : ERROR_MESSAGES.NETWORK_ERROR);
    } finally {
      setIsSaving(false);
    }
  };

  // メモ保存
  const handleSaveMemo = async () => {
    if (!video) return;

    if (memo.length > 1000) {
      setError(ERROR_MESSAGES.MEMO_TOO_LONG);
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/videos/${videoId}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ memo }),
      });

      if (!response.ok) {
        throw new Error(ERROR_MESSAGES.UPDATE_FAILED);
      }

      const data = await response.json();
      setVideo(data.video);
      onUpdate?.();
    } catch (err) {
      console.error('メモ更新エラー:', err);
      setError(err instanceof Error ? err.message : ERROR_MESSAGES.NETWORK_ERROR);
    } finally {
      setIsSaving(false);
    }
  };

  // 削除実行
  const handleDelete = async () => {
    if (!video) return;

    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/videos/${videoId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(ERROR_MESSAGES.DELETE_FAILED);
      }

      onDelete?.();
      onClose();
    } catch (err) {
      console.error('動画削除エラー:', err);
      setError(err instanceof Error ? err.message : ERROR_MESSAGES.NETWORK_ERROR);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  const isFavorite = video?.userSetting?.isFavorite ?? false;
  const isSkip = video?.userSetting?.isSkip ?? false;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6">動画詳細</Typography>
          <IconButton onClick={onClose} size="small" aria-label="閉じる">
            <Close />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : video ? (
          <Box>
            {/* サムネイル */}
            <Box
              component="img"
              src={video.thumbnailUrl}
              alt={video.title}
              sx={{
                width: '100%',
                maxHeight: 400,
                objectFit: 'contain',
                backgroundColor: 'grey.200',
                borderRadius: 1,
                mb: 2,
              }}
            />

            {/* タイトルとニコニコ動画リンク */}
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 2 }}>
              <Typography variant="h6" component="h2" sx={{ flex: 1 }}>
                {video.title}
              </Typography>
              <Tooltip title="ニコニコ動画で開く">
                <IconButton
                  component="a"
                  href={`https://www.nicovideo.jp/watch/${video.videoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  size="small"
                  aria-label="ニコニコ動画で開く"
                >
                  <OpenInNew />
                </IconButton>
              </Tooltip>
            </Box>

            {/* メタデータ */}
            <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
              <Chip label={video.length} size="small" variant="outlined" />
              <Chip label={formatDate(video.createdAt)} size="small" variant="outlined" />
            </Stack>

            {/* お気に入り・スキップボタン */}
            <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
              <Button
                variant={isFavorite ? 'contained' : 'outlined'}
                color={isFavorite ? 'error' : 'inherit'}
                startIcon={isFavorite ? <Favorite /> : <FavoriteBorder />}
                onClick={handleToggleFavorite}
                disabled={isSaving}
                fullWidth
              >
                {isFavorite ? 'お気に入り解除' : 'お気に入りに追加'}
              </Button>
              <Button
                variant={isSkip ? 'contained' : 'outlined'}
                color={isSkip ? 'warning' : 'inherit'}
                startIcon={isSkip ? <RemoveCircle /> : <RemoveCircleOutline />}
                onClick={handleToggleSkip}
                disabled={isSaving}
                fullWidth
              >
                {isSkip ? 'スキップ解除' : 'スキップに設定'}
              </Button>
            </Box>

            {/* メモ編集 */}
            <Box sx={{ mb: 2 }}>
              <TextField
                label="メモ"
                multiline
                rows={4}
                fullWidth
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="この動画に関するメモを入力してください"
                helperText={`${memo.length}/1000文字`}
                error={memo.length > 1000}
                disabled={isSaving}
              />
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
                <Button
                  variant="contained"
                  onClick={handleSaveMemo}
                  disabled={isSaving || memo.length > 1000}
                >
                  メモを保存
                </Button>
              </Box>
            </Box>

            {/* 削除確認 */}
            {showDeleteConfirm ? (
              <Box sx={{ bgcolor: 'error.light', p: 2, borderRadius: 1 }}>
                <Typography variant="body2" sx={{ mb: 1, color: 'error.contrastText' }}>
                  この動画を削除してもよろしいですか？この操作は取り消せません。
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    variant="contained"
                    color="error"
                    onClick={handleDelete}
                    disabled={isDeleting}
                    startIcon={isDeleting ? <CircularProgress size={20} /> : <Delete />}
                  >
                    削除する
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={isDeleting}
                    sx={{
                      color: 'error.contrastText',
                      borderColor: 'error.contrastText',
                      '&:hover': {
                        borderColor: 'error.contrastText',
                        bgcolor: 'rgba(255, 255, 255, 0.1)',
                      },
                    }}
                  >
                    キャンセル
                  </Button>
                </Box>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<Delete />}
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isSaving || isDeleting}
                >
                  動画を削除
                </Button>
              </Box>
            )}
          </Box>
        ) : null}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={isSaving || isDeleting}>
          閉じる
        </Button>
      </DialogActions>
    </Dialog>
  );
}
