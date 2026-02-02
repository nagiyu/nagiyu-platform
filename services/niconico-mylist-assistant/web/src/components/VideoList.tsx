'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Grid, Box, Typography, CircularProgress, Alert } from '@mui/material';
import type { VideosListResponse } from '@nagiyu/niconico-mylist-assistant-core';
import VideoCard from './VideoCard';
import VideoListFilters from './VideoListFilters';
import VideoListPagination from './VideoListPagination';
import VideoDetailModal from './VideoDetailModal';

const ERROR_MESSAGES = {
  FETCH_FAILED: '動画一覧の取得に失敗しました',
  NETWORK_ERROR: 'ネットワークエラーが発生しました',
} as const;

/**
 * 動画一覧コンポーネント
 *
 * 動画カードのグリッド表示、フィルター、ページネーション、動画詳細モーダルを統合したコンポーネント。
 * URLクエリパラメータと状態を同期し、ブラウザバック/フォワードに対応。
 */
export default function VideoList() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [videos, setVideos] = useState<VideosListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // フィルター状態
  const [favoriteFilter, setFavoriteFilter] = useState<string>('all');
  const [skipFilter, setSkipFilter] = useState<string>('all');

  // ページネーション状態
  const [offset, setOffset] = useState(0);
  const limit = 20;

  // モーダル状態
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // URLクエリパラメータを更新する関数
  const updateURL = useCallback(
    (newFavoriteFilter: string, newSkipFilter: string, newOffset: number) => {
      const params = new URLSearchParams();

      if (newFavoriteFilter !== 'all') {
        params.set('favorite', newFavoriteFilter);
      }

      if (newSkipFilter !== 'all') {
        params.set('skip', newSkipFilter);
      }

      if (newOffset > 0) {
        params.set('offset', newOffset.toString());
      }

      const query = params.toString();
      const url = query ? `/mylist?${query}` : '/mylist';

      // ブラウザ履歴を更新
      router.push(url, { scroll: false });
    },
    [router]
  );

  // 動画一覧を取得
  const fetchVideos = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
      });

      if (favoriteFilter !== 'all') {
        params.append('isFavorite', favoriteFilter);
      }

      if (skipFilter !== 'all') {
        params.append('isSkip', skipFilter);
      }

      const response = await fetch(`/api/videos?${params.toString()}`);

      if (!response.ok) {
        throw new Error(ERROR_MESSAGES.FETCH_FAILED);
      }

      const data: VideosListResponse = await response.json();
      setVideos(data);
    } catch (err) {
      console.error('動画一覧取得エラー:', err);
      setError(err instanceof Error ? err.message : ERROR_MESSAGES.NETWORK_ERROR);
    } finally {
      setLoading(false);
    }
  }, [offset, favoriteFilter, skipFilter]);

  // URLクエリパラメータの変更を監視して状態を同期
  useEffect(() => {
    const newFavoriteFilter = searchParams.get('favorite') || 'all';
    const newSkipFilter = searchParams.get('skip') || 'all';
    const newOffset = parseInt(searchParams.get('offset') || '0', 10);

    // 状態が異なる場合のみ更新（無限ループ防止）
    // searchParamsのみに依存し、状態変数は依存配列に含めない
    setFavoriteFilter(newFavoriteFilter);
    setSkipFilter(newSkipFilter);
    setOffset(newOffset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // 初回レンダリング時とフィルター・ページネーション変更時に動画を取得
  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  // お気に入り切り替え
  const handleToggleFavorite = async (videoId: string, isFavorite: boolean) => {
    try {
      const response = await fetch(`/api/videos/${videoId}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isFavorite }),
      });

      if (!response.ok) {
        throw new Error('お気に入りの更新に失敗しました');
      }

      // 成功したら動画一覧を再取得
      await fetchVideos();
    } catch (err) {
      console.error('お気に入り更新エラー:', err);
      setError(err instanceof Error ? err.message : 'お気に入りの更新に失敗しました');
    }
  };

  // スキップ切り替え
  const handleToggleSkip = async (videoId: string, isSkip: boolean) => {
    try {
      const response = await fetch(`/api/videos/${videoId}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isSkip }),
      });

      if (!response.ok) {
        throw new Error('スキップの更新に失敗しました');
      }

      // 成功したら動画一覧を再取得
      await fetchVideos();
    } catch (err) {
      console.error('スキップ更新エラー:', err);
      setError(err instanceof Error ? err.message : 'スキップの更新に失敗しました');
    }
  };

  // フィルター変更時はページをリセットしてURLを更新
  const handleFavoriteFilterChange = (value: string) => {
    setFavoriteFilter(value);
    setOffset(0);
    // 新しい値を直接使用してURLを更新（stateの非同期更新に依存しない）
    updateURL(value, skipFilter, 0);
  };

  const handleSkipFilterChange = (value: string) => {
    setSkipFilter(value);
    setOffset(0);
    // 新しい値を直接使用してURLを更新（stateの非同期更新に依存しない）
    updateURL(favoriteFilter, value, 0);
  };

  const handlePageChange = (newOffset: number) => {
    setOffset(newOffset);
    // 新しい値を直接使用してURLを更新（stateの非同期更新に依存しない）
    updateURL(favoriteFilter, skipFilter, newOffset);
    // ページ上部にスクロール
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 動画詳細モーダルを開く
  const handleVideoClick = (videoId: string) => {
    setSelectedVideoId(videoId);
    setModalOpen(true);
  };

  // モーダルを閉じる
  const handleModalClose = () => {
    setModalOpen(false);
    setSelectedVideoId(null);
  };

  // モーダルからの更新時（設定変更・削除時）
  const handleModalChange = () => {
    fetchVideos();
  };

  if (loading && !videos) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <VideoListFilters
        favoriteFilter={favoriteFilter}
        skipFilter={skipFilter}
        onFavoriteFilterChange={handleFavoriteFilterChange}
        onSkipFilterChange={handleSkipFilterChange}
      />

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {videos && videos.total === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography variant="h6" color="text.secondary">
            動画が見つかりませんでした
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            フィルター条件を変更するか、動画をインポートしてください
          </Typography>
        </Box>
      ) : (
        <>
          <Grid container spacing={3}>
            {videos?.videos.map((video) => (
              <Grid key={video.videoId} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                <VideoCard
                  video={video}
                  onToggleFavorite={handleToggleFavorite}
                  onToggleSkip={handleToggleSkip}
                  onClick={handleVideoClick}
                />
              </Grid>
            ))}
          </Grid>

          {videos && (
            <VideoListPagination
              total={videos.total}
              limit={videos.limit}
              offset={videos.offset}
              onPageChange={handlePageChange}
            />
          )}
        </>
      )}

      <VideoDetailModal
        videoId={selectedVideoId}
        open={modalOpen}
        onClose={handleModalClose}
        onUpdate={handleModalChange}
        onDelete={handleModalChange}
      />
    </Box>
  );
}
