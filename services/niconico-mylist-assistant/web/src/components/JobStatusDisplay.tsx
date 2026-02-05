'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  CircularProgress,
  Alert,
  LinearProgress,
  Chip,
  Stack,
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  HourglassEmpty as HourglassIcon,
  PlayArrow as PlayArrowIcon,
} from '@mui/icons-material';
import type { JobStatusDisplayProps, JobStatusState } from '@/types/job';
import { DEFAULT_POLLING_CONFIG } from '@/types/job';
import type { BatchStatus, BatchJobStatusResponse } from '@nagiyu/niconico-mylist-assistant-core';

const ERROR_MESSAGES = {
  FETCH_FAILED: 'ジョブステータスの取得に失敗しました',
  NETWORK_ERROR: 'ネットワークエラーが発生しました',
  NOT_FOUND: '指定されたジョブが見つかりません',
} as const;

/**
 * ジョブステータス表示コンポーネント
 *
 * バッチジョブのステータスをリアルタイムで表示し、進捗を追跡します。
 * - 定期的にポーリングしてステータスを更新
 * - 完了時にコールバックを実行
 * - ステータスに応じたUIを表示
 */
export default function JobStatusDisplay({ jobId, onComplete, onError }: JobStatusDisplayProps) {
  const [state, setState] = useState<JobStatusState>({
    status: 'SUBMITTED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isLoading: true,
  });

  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const attemptCountRef = useRef(0);
  const hasCompletedRef = useRef(false);

  /**
   * ジョブステータスを取得
   */
  const fetchJobStatus = useCallback(async () => {
    try {
      const response = await fetch(`/api/batch/status/${jobId}`);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(ERROR_MESSAGES.NOT_FOUND);
        }
        throw new Error(ERROR_MESSAGES.FETCH_FAILED);
      }

      const data: BatchJobStatusResponse = await response.json();

      setState({
        status: data.status,
        result: data.result,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        completedAt: data.completedAt,
        isLoading: false,
      });

      // 完了状態の場合、ポーリングを停止してコールバックを実行（1回のみ）
      if (data.status === 'SUCCEEDED' || data.status === 'FAILED') {
        // ポーリングを停止
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }

        // コールバックを実行（1回のみ）
        if (!hasCompletedRef.current) {
          hasCompletedRef.current = true;

          if (data.status === 'SUCCEEDED' && data.result && onComplete) {
            onComplete(data.result);
          } else if (data.status === 'FAILED' && onError) {
            const errorMessage = data.result?.errorMessage || 'ジョブが失敗しました';
            onError(errorMessage);
          }
        }
      }
    } catch (error) {
      console.error('ジョブステータス取得エラー:', error);
      const errorMessage =
        error instanceof Error ? error.message : ERROR_MESSAGES.NETWORK_ERROR;

      setState((prev) => ({
        ...prev,
        error: errorMessage,
        isLoading: false,
      }));

      // ポーリングを停止
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }

      // エラーコールバックを実行（1回のみ）
      if (!hasCompletedRef.current && onError) {
        hasCompletedRef.current = true;
        onError(errorMessage);
      }
    }
  }, [jobId, onComplete, onError]);

  /**
   * ポーリングを開始
   */
  useEffect(() => {
    // 初回取得
    fetchJobStatus();

    // ポーリング開始
    pollingIntervalRef.current = setInterval(() => {
      attemptCountRef.current += 1;

      // 最大試行回数に達した場合、ポーリングを停止
      if (
        DEFAULT_POLLING_CONFIG.maxAttempts &&
        attemptCountRef.current >= DEFAULT_POLLING_CONFIG.maxAttempts
      ) {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        setState((prev) => ({
          ...prev,
          error: 'ジョブステータスの取得がタイムアウトしました',
          isLoading: false,
        }));
        return;
      }

      fetchJobStatus();
    }, DEFAULT_POLLING_CONFIG.intervalMs);

    // クリーンアップ
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [fetchJobStatus]);

  /**
   * ステータスに応じたアイコンを返す
   */
  const getStatusIcon = (status: BatchStatus) => {
    switch (status) {
      case 'SUBMITTED':
        return <HourglassIcon sx={{ fontSize: 40 }} />;
      case 'RUNNING':
        return <PlayArrowIcon sx={{ fontSize: 40 }} />;
      case 'SUCCEEDED':
        return <CheckCircleIcon sx={{ fontSize: 40, color: 'success.main' }} />;
      case 'FAILED':
        return <ErrorIcon sx={{ fontSize: 40, color: 'error.main' }} />;
    }
  };

  /**
   * ステータスに応じた色を返す
   */
  const getStatusColor = (
    status: BatchStatus
  ): 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning' => {
    switch (status) {
      case 'SUBMITTED':
        return 'info';
      case 'RUNNING':
        return 'primary';
      case 'SUCCEEDED':
        return 'success';
      case 'FAILED':
        return 'error';
    }
  };

  /**
   * ステータスに応じたラベルを返す
   */
  const getStatusLabel = (status: BatchStatus): string => {
    switch (status) {
      case 'SUBMITTED':
        return '投入済み';
      case 'RUNNING':
        return '実行中';
      case 'SUCCEEDED':
        return '完了';
      case 'FAILED':
        return '失敗';
    }
  };

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Stack spacing={2}>
          {/* ヘッダー */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="h6" component="h2">
              ジョブステータス
            </Typography>
            <Chip label={getStatusLabel(state.status)} color={getStatusColor(state.status)} />
          </Box>

          {/* エラー表示 */}
          {state.error && (
            <Alert severity="error" onClose={() => setState((prev) => ({ ...prev, error: undefined }))}>
              {state.error}
            </Alert>
          )}

          {/* ステータス表示 */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {state.isLoading ? (
              <CircularProgress size={40} />
            ) : (
              getStatusIcon(state.status)
            )}
            <Box sx={{ flexGrow: 1 }}>
              <Typography variant="body1" gutterBottom>
                ジョブID: {jobId}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {state.status === 'RUNNING' && 'マイリスト登録処理を実行中...'}
                {state.status === 'SUBMITTED' && 'ジョブの実行を待機中...'}
                {state.status === 'SUCCEEDED' && 'マイリスト登録が完了しました'}
                {state.status === 'FAILED' && 'マイリスト登録に失敗しました'}
              </Typography>
            </Box>
          </Box>

          {/* プログレスバー（実行中のみ） */}
          {(state.status === 'SUBMITTED' || state.status === 'RUNNING') && (
            <LinearProgress />
          )}

          {/* 結果表示 */}
          {state.result && (
            <Box
              sx={{
                p: 2,
                bgcolor: state.status === 'SUCCEEDED' ? 'success.light' : 'error.light',
                borderRadius: 1,
              }}
            >
              <Typography variant="body2" gutterBottom>
                <strong>処理結果</strong>
              </Typography>
              <Stack spacing={0.5}>
                <Typography variant="body2">
                  登録成功: {state.result.registeredCount} 件
                </Typography>
                <Typography variant="body2">
                  登録失敗: {state.result.failedCount} 件
                </Typography>
                <Typography variant="body2">
                  総件数: {state.result.totalCount} 件
                </Typography>
                {state.result.errorMessage && (
                  <Typography variant="body2" color="error">
                    エラー: {state.result.errorMessage}
                  </Typography>
                )}
              </Stack>
            </Box>
          )}

          {/* タイムスタンプ */}
          <Box sx={{ pt: 1, borderTop: 1, borderColor: 'divider' }}>
            <Typography variant="caption" color="text.secondary" display="block">
              作成日時: {new Date(state.createdAt).toLocaleString('ja-JP')}
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block">
              更新日時: {new Date(state.updatedAt).toLocaleString('ja-JP')}
            </Typography>
            {state.completedAt && (
              <Typography variant="caption" color="text.secondary" display="block">
                完了日時: {new Date(state.completedAt).toLocaleString('ja-JP')}
              </Typography>
            )}
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}
