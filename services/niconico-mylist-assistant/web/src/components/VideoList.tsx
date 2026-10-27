'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { COMMON_ERROR_MESSAGES } from '@nagiyu/common';
import { useRouter, useSearchParams } from 'next/navigation';
import { Grid, Box, Typography } from '@mui/material';
import { ErrorAlert, LoadingState } from '@nagiyu/ui';
import type { VideosListResponse } from '@nagiyu/niconico-mylist-assistant-core';
import VideoCard from './VideoCard';
import VideoListFilters from './VideoListFilters';
import VideoListPagination from './VideoListPagination';
import VideoDetailModal from './VideoDetailModal';

const ERROR_MESSAGES = {
  FETCH_FAILED: '動画一覧の取得に失敗しました',
  FAVORITE_UPDATE_FAILED: 'お気に入りの更新に失敗しました',
  SKIP_UPDATE_FAILED: 'スキップの更新に失敗しました',
  NETWORK_ERROR: COMMON_ERROR_MESSAGES.NETWORK_ERROR_OCCURRED,
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

  // フィルター・ページネーション状態
  // 既定値で始めると、URL 同期の前に絞り込み無しの取得が一度走り、
  // その応答が正しい取得の結果より遅れて届くと表示が食い違う。
  // 初回から URL の値で始めて、その取得を無くす。
  const [favoriteFilter, setFavoriteFilter] = useState<string>(
    () => searchParams.get('favorite') || 'all'
  );
  const [skipFilter, setSkipFilter] = useState<string>(() => searchParams.get('skip') || 'all');
  const [searchKeyword, setSearchKeyword] = useState<string>(
    () => searchParams.get('search') || ''
  );
  const [offset, setOffset] = useState(() => parseInt(searchParams.get('offset') || '0', 10));
  const limit = 20;

  // モーダル状態
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // 現在の状態を追跡するref（stale closureを回避）
  // 初期値は URL から決めた state の初期値と同じ
  const stateRef = useRef({ favoriteFilter, skipFilter, searchKeyword, offset });
  useEffect(() => {
    stateRef.current = { favoriteFilter, skipFilter, searchKeyword, offset };
  }, [favoriteFilter, skipFilter, searchKeyword, offset]);

  // URLクエリパラメータを更新する関数
  const updateURL = useCallback(
    (
      newFavoriteFilter: string,
      newSkipFilter: string,
      newSearchKeyword: string,
      newOffset: number
    ) => {
      const params = new URLSearchParams();

      if (newFavoriteFilter !== 'all') {
        params.set('favorite', newFavoriteFilter);
      }

      if (newSkipFilter !== 'all') {
        params.set('skip', newSkipFilter);
      }

      if (newSearchKeyword.trim() !== '') {
        params.set('search', newSearchKeyword.trim());
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

  // 実行中の取得を中止するための AbortController
  // 取得が重なると応答の到着順で表示が決まってしまうため、最新の取得の結果だけを反映する。
  const abortControllerRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // 動画一覧を取得
  const fetchVideos = useCallback(async () => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

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

      if (searchKeyword.trim() !== '') {
        params.append('search', searchKeyword.trim());
      }

      const response = await fetch(`/api/videos?${params.toString()}`, {
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(ERROR_MESSAGES.FETCH_FAILED);
      }

      const data: VideosListResponse = await response.json();
      // signal を無視する経路 (応答の読み取り中など) でも古い結果を反映しない
      if (controller.signal.aborted) {
        return;
      }
      setVideos(data);
    } catch (err) {
      // 中止された取得は新しい取得に置き換わったもので、エラーではない
      if (controller.signal.aborted) {
        return;
      }
      console.error('動画一覧取得エラー:', err);
      setError(err instanceof Error ? err.message : ERROR_MESSAGES.NETWORK_ERROR);
    } finally {
      // 中止後に loading を戻すと、後続の取得中の表示が消える
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [offset, favoriteFilter, skipFilter, searchKeyword]);

  // URLクエリパラメータの変更を監視して状態を同期
  useEffect(() => {
    const newFavoriteFilter = searchParams.get('favorite') || 'all';
    const newSkipFilter = searchParams.get('skip') || 'all';
    const newSearchKeyword = searchParams.get('search') || '';
    const newOffset = parseInt(searchParams.get('offset') || '0', 10);

    // 状態が異なる場合のみ更新（無限ループと不要な再レンダリングを防止）
    // refを使用して最新の状態と比較（stale closureを回避）
    if (newFavoriteFilter !== stateRef.current.favoriteFilter) {
      setFavoriteFilter(newFavoriteFilter);
    }
    if (newSkipFilter !== stateRef.current.skipFilter) {
      setSkipFilter(newSkipFilter);
    }
    if (newSearchKeyword !== stateRef.current.searchKeyword) {
      setSearchKeyword(newSearchKeyword);
    }
    if (newOffset !== stateRef.current.offset) {
      setOffset(newOffset);
    }
  }, [searchParams]);

  // 初回レンダリング時とフィルター・ページネーション変更時に動画を取得
  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  // 設定の更新中の動画
  // 同じ動画の設定更新が重なると、同じ値の更新が何度も送られて切り替えが戻らなくなる。
  // 連続クリックは再描画より先に届くことがあるため、判定は ref で行い、ボタンの無効化用に state にも持つ。
  const pendingVideoIdsRef = useRef<Set<string>>(new Set());
  const [pendingVideoIds, setPendingVideoIds] = useState<ReadonlySet<string>>(new Set());

  // 一覧の該当動画の設定だけを書き換える
  const patchVideoSetting = useCallback(
    (videoId: string, patch: { isFavorite?: boolean; isSkip?: boolean }) => {
      setVideos((prev) => {
        if (!prev) {
          return prev;
        }
        return {
          ...prev,
          videos: prev.videos.map((video) => {
            if (video.videoId !== videoId) {
              return video;
            }
            const now = Date.now();
            return {
              ...video,
              userSetting: {
                videoId,
                isFavorite: false,
                isSkip: false,
                createdAt: now,
                updatedAt: now,
                ...video.userSetting,
                ...patch,
              },
            };
          }),
        };
      });
    },
    []
  );

  // 動画の設定を更新する
  // 再取得を待つと古い値のまま表示され続けるため、送信前に一覧へ反映し、失敗したら戻す。
  const updateVideoSetting = async (
    videoId: string,
    patch: { isFavorite: boolean } | { isSkip: boolean },
    revertPatch: { isFavorite: boolean } | { isSkip: boolean },
    errorMessage: string,
    logLabel: string
  ) => {
    if (pendingVideoIdsRef.current.has(videoId)) {
      return;
    }
    pendingVideoIdsRef.current.add(videoId);
    setPendingVideoIds(new Set(pendingVideoIdsRef.current));
    patchVideoSetting(videoId, patch);

    try {
      const response = await fetch(`/api/videos/${videoId}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(patch),
      });

      if (!response.ok) {
        throw new Error(errorMessage);
      }

      // 絞り込み中は設定の変更で一覧から外れる動画があるため、成功したら再取得する
      await fetchVideos();
    } catch (err) {
      console.error(logLabel, err);
      patchVideoSetting(videoId, revertPatch);
      setError(err instanceof Error ? err.message : errorMessage);
    } finally {
      pendingVideoIdsRef.current.delete(videoId);
      setPendingVideoIds(new Set(pendingVideoIdsRef.current));
    }
  };

  // お気に入り切り替え
  const handleToggleFavorite = (videoId: string, isFavorite: boolean) =>
    updateVideoSetting(
      videoId,
      { isFavorite },
      { isFavorite: !isFavorite },
      ERROR_MESSAGES.FAVORITE_UPDATE_FAILED,
      'お気に入り更新エラー:'
    );

  // スキップ切り替え
  const handleToggleSkip = (videoId: string, isSkip: boolean) =>
    updateVideoSetting(
      videoId,
      { isSkip },
      { isSkip: !isSkip },
      ERROR_MESSAGES.SKIP_UPDATE_FAILED,
      'スキップ更新エラー:'
    );

  // フィルター変更時はページをリセットしてURLを更新
  // URLが更新されると useEffect が状態を同期するため、setState は不要
  const handleFavoriteFilterChange = (value: string) => {
    // 現在のURLから最新の値を取得（stale closureを回避）
    const currentSkipFilter = searchParams.get('skip') || 'all';
    const currentSearchKeyword = searchParams.get('search') || '';
    updateURL(value, currentSkipFilter, currentSearchKeyword, 0);
  };

  const handleSkipFilterChange = (value: string) => {
    // 現在のURLから最新の値を取得（stale closureを回避）
    const currentFavoriteFilter = searchParams.get('favorite') || 'all';
    const currentSearchKeyword = searchParams.get('search') || '';
    updateURL(currentFavoriteFilter, value, currentSearchKeyword, 0);
  };

  const handleSearch = (keyword: string) => {
    // 現在のURLから最新の値を取得（stale closureを回避）
    const currentFavoriteFilter = searchParams.get('favorite') || 'all';
    const currentSkipFilter = searchParams.get('skip') || 'all';
    updateURL(currentFavoriteFilter, currentSkipFilter, keyword, 0);
  };

  const handlePageChange = (newOffset: number) => {
    // 現在のURLから最新の値を取得（stale closureを回避）
    const currentFavoriteFilter = searchParams.get('favorite') || 'all';
    const currentSkipFilter = searchParams.get('skip') || 'all';
    const currentSearchKeyword = searchParams.get('search') || '';
    updateURL(currentFavoriteFilter, currentSkipFilter, currentSearchKeyword, newOffset);
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
    return <LoadingState />;
  }

  return (
    <Box>
      <VideoListFilters
        favoriteFilter={favoriteFilter}
        skipFilter={skipFilter}
        searchKeyword={searchKeyword}
        onFavoriteFilterChange={handleFavoriteFilterChange}
        onSkipFilterChange={handleSkipFilterChange}
        onSearch={handleSearch}
      />

      {error && (
        <Box sx={{ mb: 3 }}>
          <ErrorAlert message={error} onClose={() => setError(null)} />
        </Box>
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
                  disabled={pendingVideoIds.has(video.videoId)}
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
