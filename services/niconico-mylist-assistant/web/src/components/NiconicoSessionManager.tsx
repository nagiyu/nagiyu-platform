'use client';

import { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Card, CardContent, Divider, Alert } from '@mui/material';
import { Button, TextField, ErrorAlert } from '@nagiyu/ui';
import { extractErrorMessage } from '@nagiyu/common';
import type { NiconicoSessionStatus } from '@/types/mylist';

interface NiconicoSessionManagerProps {
  /** セッション状態変更時に呼ばれるコールバック */
  onStatusChange?: (status: NiconicoSessionStatus) => void;
}

/**
 * セッションの有効性を日本語ラベルに変換する
 */
function formatValidity(
  hasSession: boolean,
  validity: NiconicoSessionStatus['validity']
): { label: string; color: 'success' | 'error' | 'warning' | 'info' } {
  if (!hasSession) {
    return { label: '未登録', color: 'info' };
  }
  switch (validity) {
    case 'valid':
      return { label: '有効', color: 'success' };
    case 'invalid':
      return { label: '無効', color: 'error' };
    case 'unknown':
      return { label: '判定不能', color: 'warning' };
    default:
      return { label: '不明', color: 'info' };
  }
}

/**
 * epoch ms から「あと N 日」を算出する
 */
function formatRemainingDays(estimatedExpiresAt: number | undefined): string {
  if (estimatedExpiresAt == null) {
    return '';
  }
  const remaining = Math.max(
    0,
    Math.ceil((estimatedExpiresAt - Date.now()) / (1000 * 60 * 60 * 24))
  );
  return `あと ${remaining} 日`;
}

/**
 * epoch ms を日付文字列に変換する
 */
function formatDate(epochMs: number | undefined): string {
  if (epochMs == null) {
    return '';
  }
  return new Date(epochMs).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * ニコニコセッション管理コンポーネント
 *
 * 現在のセッション状態（有効/無効/未登録）の表示、
 * user_session の設定/更新フォーム、削除ボタンを提供する。
 * 登録ページ上の独立コンポーネントとして配置する。
 */
export default function NiconicoSessionManager({ onStatusChange }: NiconicoSessionManagerProps) {
  const [status, setStatus] = useState<NiconicoSessionStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [userSession, setUserSession] = useState('');
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  /**
   * セッション状態を取得する
   */
  const fetchStatus = useCallback(async () => {
    setStatusLoading(true);
    setStatusError(null);
    try {
      const response = await fetch('/api/niconico/session');
      if (!response.ok) {
        let errorMessage = 'セッション状態の取得に失敗しました';
        try {
          const data = await response.json();
          errorMessage = extractErrorMessage(data, errorMessage);
        } catch {
          // JSON パース失敗時はデフォルトメッセージを使用
        }
        throw new Error(errorMessage);
      }
      const data: NiconicoSessionStatus = await response.json();
      setStatus(data);
      onStatusChange?.(data);
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setStatusLoading(false);
    }
  }, [onStatusChange]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  /**
   * セッションを保存/更新する
   */
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveLoading(true);
    setSaveError(null);
    setSaveSuccess(false);

    if (!userSession.trim()) {
      setSaveError('user_session を入力してください');
      setSaveLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/niconico/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userSession }),
      });

      if (!response.ok) {
        let errorMessage = 'セッションの保存に失敗しました';
        try {
          const data = await response.json();
          errorMessage = extractErrorMessage(data, errorMessage);
        } catch {
          // JSON パース失敗時はデフォルトメッセージを使用
        }
        throw new Error(errorMessage);
      }

      setSaveSuccess(true);
      setUserSession('');
      // 状態を再取得
      await fetchStatus();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setSaveLoading(false);
    }
  };

  /**
   * セッションを削除する
   */
  const handleDelete = async () => {
    setDeleteLoading(true);
    setDeleteError(null);

    try {
      const response = await fetch('/api/niconico/session', { method: 'DELETE' });

      if (!response.ok) {
        let errorMessage = 'セッションの削除に失敗しました';
        try {
          const data = await response.json();
          errorMessage = extractErrorMessage(data, errorMessage);
        } catch {
          // JSON パース失敗時はデフォルトメッセージを使用
        }
        throw new Error(errorMessage);
      }

      // 状態を再取得
      await fetchStatus();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setDeleteLoading(false);
    }
  };

  const validityInfo = status
    ? formatValidity(status.hasSession, status.validity)
    : { label: '取得中...', color: 'info' as const };

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          ニコニコセッション管理
        </Typography>

        {/* 現在の状態表示 */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            現在の状態
          </Typography>

          {statusError && <ErrorAlert message={statusError} />}

          {!statusLoading && status && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Alert severity={validityInfo.color} sx={{ py: 0.5 }}>
                {validityInfo.label}
                {status.hasSession && status.estimatedExpiresAt != null && (
                  <Typography component="span" variant="body2" sx={{ ml: 1 }}>
                    （有効期限の目安：{formatRemainingDays(status.estimatedExpiresAt)}）
                  </Typography>
                )}
              </Alert>

              {status.hasSession && status.acquiredAt != null && (
                <Typography variant="caption" color="text.secondary">
                  取得日時：{formatDate(status.acquiredAt)} 推定有効期限：
                  {formatDate(status.estimatedExpiresAt)}
                </Typography>
              )}
            </Box>
          )}

          {statusLoading && (
            <Typography variant="body2" color="text.secondary">
              状態を確認中...
            </Typography>
          )}
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* セッション設定/更新フォーム */}
        <Box component="form" onSubmit={handleSave}>
          <Typography variant="subtitle2" gutterBottom>
            セッションを設定/更新
          </Typography>

          {saveError && <ErrorAlert message={saveError} />}
          {saveSuccess && (
            <Alert severity="success" sx={{ mb: 1 }}>
              セッションを保存しました
            </Alert>
          )}

          <TextField
            label="user_session"
            type="password"
            value={userSession}
            onChange={(e) => setUserSession(e.target.value)}
            fullWidth
            autoComplete="off"
            helperText="必ずシークレット窓でニコニコ動画にログインして取得した user_session を貼り付けてください（普段使いのブラウザで取ると別のログインセッションが無効化される恐れがあります）"
          />

          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
            <Button type="submit" variant="solid" color="primary" loading={saveLoading}>
              {saveLoading ? '保存中...' : 'セッションを保存'}
            </Button>
          </Box>
        </Box>

        {/* 削除ボタン（セッションが保存されている場合のみ表示） */}
        {status?.hasSession && (
          <>
            <Divider sx={{ my: 2 }} />

            <Box>
              <Typography variant="subtitle2" gutterBottom>
                セッションを削除
              </Typography>

              {deleteError && <ErrorAlert message={deleteError} />}

              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                セッションを削除すると、マイリスト登録ができなくなります。 再度登録するには、新しい
                user_session を取得して上記フォームから設定してください。
              </Typography>

              <Button
                variant="outline"
                color="secondary"
                onClick={handleDelete}
                loading={deleteLoading}
              >
                {deleteLoading ? '削除中...' : 'セッションを削除'}
              </Button>
            </Box>
          </>
        )}
      </CardContent>
    </Card>
  );
}
