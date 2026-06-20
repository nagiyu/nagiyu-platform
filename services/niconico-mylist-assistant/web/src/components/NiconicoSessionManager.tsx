'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
} from '@mui/material';
import { Button, TextField, ErrorAlert, Chip } from '@nagiyu/ui';
import { extractErrorMessage } from '@nagiyu/common';
import type { NiconicoSessionStatus } from '@/types/mylist';
import { ERROR_MESSAGES } from '@/lib/constants/errors';

interface NiconicoSessionManagerProps {
  /** セッション状態変更時に呼ばれるコールバック */
  onStatusChange?: (status: NiconicoSessionStatus) => void;
}

/**
 * セッションの有効性を Chip / Alert の色と日本語ラベルに変換する。
 *
 * - chipColor: @nagiyu/ui Chip の ChipColor 型に合わせた値
 * - alertSeverity: MUI Alert の severity に合わせた値
 */
function formatValidity(
  hasSession: boolean,
  validity: NiconicoSessionStatus['validity']
): {
  label: string;
  chipColor: 'success' | 'danger' | 'warning' | 'neutral';
  alertSeverity: 'success' | 'error' | 'warning' | 'info';
} {
  if (!hasSession) {
    return { label: '未登録', chipColor: 'neutral', alertSeverity: 'info' };
  }
  switch (validity) {
    case 'valid':
      return { label: '有効', chipColor: 'success', alertSeverity: 'success' };
    case 'invalid':
      return { label: '無効', chipColor: 'danger', alertSeverity: 'error' };
    case 'unknown':
      return { label: '判定不能', chipColor: 'warning', alertSeverity: 'warning' };
    default:
      return { label: '不明', chipColor: 'neutral', alertSeverity: 'info' };
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
 * 常時表示は状態のみのコンパクト表示（1 行）。
 * 「セッション管理」ボタンでダイアログを開き、
 * user_session の設定/更新・削除・取得手順ガイドを提供する。
 * 登録ページ上の独立コンポーネントとして配置する。
 */
export default function NiconicoSessionManager({ onStatusChange }: NiconicoSessionManagerProps) {
  const [status, setStatus] = useState<NiconicoSessionStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);

  /** ダイアログの開閉状態 */
  const [dialogOpen, setDialogOpen] = useState(false);

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
        // as string: ERROR_MESSAGES は as const のリテラル型だが、
        // extractErrorMessage の戻り値は string 型のため明示的に widening する
        let errorMessage: string = ERROR_MESSAGES.NICONICO_SESSION_STATUS_FETCH_FAILED;
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
      setStatusError(err instanceof Error ? err.message : ERROR_MESSAGES.GENERIC_ERROR);
    } finally {
      setStatusLoading(false);
    }
  }, [onStatusChange]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  /**
   * ダイアログを開く
   */
  const handleOpenDialog = () => {
    // ダイアログを開くたびに入力値・成功/エラー状態をリセットする
    setUserSession('');
    setSaveError(null);
    setSaveSuccess(false);
    setDeleteError(null);
    setDialogOpen(true);
  };

  /**
   * ダイアログを閉じる
   */
  const handleCloseDialog = () => {
    setDialogOpen(false);
  };

  /**
   * セッションを保存/更新する
   */
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveLoading(true);
    setSaveError(null);
    setSaveSuccess(false);

    if (!userSession.trim()) {
      setSaveError(ERROR_MESSAGES.USER_SESSION_INPUT_REQUIRED);
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
        let errorMessage: string = ERROR_MESSAGES.NICONICO_SESSION_SAVE_FAILED;
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
      // 状態を再取得し、ダイアログ外のコンパクト表示も更新する
      await fetchStatus();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : ERROR_MESSAGES.GENERIC_ERROR);
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
        let errorMessage: string = ERROR_MESSAGES.NICONICO_SESSION_DELETE_FAILED;
        try {
          const data = await response.json();
          errorMessage = extractErrorMessage(data, errorMessage);
        } catch {
          // JSON パース失敗時はデフォルトメッセージを使用
        }
        throw new Error(errorMessage);
      }

      // 状態を再取得し、ダイアログ外のコンパクト表示も更新する
      await fetchStatus();
      // 削除成功後にダイアログを閉じる
      setDialogOpen(false);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : ERROR_MESSAGES.GENERIC_ERROR);
    } finally {
      setDeleteLoading(false);
    }
  };

  const validityInfo = status
    ? formatValidity(status.hasSession, status.validity)
    : {
        label: '確認中...',
        chipColor: 'neutral' as const,
        alertSeverity: 'info' as const,
      };

  /**
   * コンパクト表示に使うサブテキスト
   * - 有効なセッションがある場合は残日数を付記する
   */
  const compactSubText =
    status?.hasSession && status.validity === 'valid' && status.estimatedExpiresAt != null
      ? `（${formatRemainingDays(status.estimatedExpiresAt)}）`
      : '';

  return (
    <>
      {/* コンパクト表示：セッション状態 + 管理ボタン */}
      <Box
        sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}
        data-testid="session-compact-view"
      >
        <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
          ニコニコセッション:
        </Typography>

        {statusLoading ? (
          <Typography variant="body2" color="text.secondary">
            確認中...
          </Typography>
        ) : statusError ? (
          <Typography variant="body2" color="error">
            取得失敗
          </Typography>
        ) : (
          <Chip color={validityInfo.chipColor} size="sm" variant="solid">
            {`${validityInfo.label}${compactSubText}`}
          </Chip>
        )}

        <Button
          variant="outline"
          color="secondary"
          onClick={handleOpenDialog}
          aria-label="セッション管理ダイアログを開く"
        >
          セッション管理
        </Button>
      </Box>

      {/* セッション管理ダイアログ */}
      <Dialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        maxWidth="sm"
        fullWidth
        aria-labelledby="session-manager-dialog-title"
      >
        <DialogTitle id="session-manager-dialog-title">ニコニコセッション管理</DialogTitle>

        <DialogContent dividers>
          {/* 現在の状態表示 */}
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              現在の状態
            </Typography>

            {statusError && <ErrorAlert message={statusError} />}

            {!statusLoading && status && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <Alert severity={validityInfo.alertSeverity} sx={{ py: 0.5 }}>
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
          <Box component="form" onSubmit={handleSave} id="session-save-form">
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
                  セッションを削除すると、マイリスト登録ができなくなります。
                  再度登録するには、新しい user_session を取得して上記フォームから設定してください。
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
        </DialogContent>

        <DialogActions>
          <Button
            type="submit"
            form="session-save-form"
            variant="solid"
            color="primary"
            loading={saveLoading}
          >
            {saveLoading ? '保存中...' : 'セッションを保存'}
          </Button>
          <Button variant="outline" color="secondary" onClick={handleCloseDialog}>
            閉じる
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
