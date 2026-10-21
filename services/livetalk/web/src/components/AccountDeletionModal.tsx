'use client';

import { useState } from 'react';
import { Alert, Typography } from '@mui/material';
import { Checkbox, ConfirmDialog } from '@nagiyu/ui';

export interface AccountDeletionModalProps {
  /** モーダルの開閉状態 */
  open: boolean;
  /** 退会処理中かどうか（ローディング状態） */
  loading: boolean;
  /** エラーメッセージ（null の場合は非表示） */
  error: string | null;
  /** 退会ボタンを押したときのコールバック */
  onConfirm: () => void;
  /** キャンセルボタンを押したときのコールバック */
  onCancel: () => void;
}

/**
 * 退会・データ削除の確認モーダル（presentational コンポーネント）。
 *
 * - 削除範囲の説明を明示する
 * - セーフティログの匿名化保持について注記する
 * - 確認チェックボックスにチェックするまで退会ボタンを無効化する
 * - loading 中は退会・キャンセル両ボタンを disabled にする
 */
export default function AccountDeletionModal({
  open,
  loading,
  error,
  onConfirm,
  onCancel,
}: AccountDeletionModalProps) {
  const [confirmed, setConfirmed] = useState(false);

  const handleCancel = () => {
    // モーダルを閉じる際にチェック状態をリセットする
    setConfirmed(false);
    onCancel();
  };

  return (
    <ConfirmDialog
      open={open}
      title="退会・データ削除"
      description="退会すると、以下のデータがすべて削除されます。この操作は取り消せません。"
      confirmLabel="退会・削除する"
      confirmDisabled={!confirmed}
      confirmTestId="deletion-confirm"
      loading={loading}
      onConfirm={onConfirm}
      onCancel={handleCancel}
    >
      <Typography variant="body2" component="ul" sx={{ mb: 2, pl: 2 }}>
        <li>会話履歴</li>
        <li>記憶データ</li>
        <li>親密度</li>
        <li>ノート</li>
        <li>その他すべての個人データ</li>
      </Typography>
      <Alert severity="info" data-testid="safety-log-notice" sx={{ mb: 2 }}>
        安全のため、自傷・自殺に関する検出ログのみ、匿名化したうえで一定期間保持します。
        保持期間が過ぎた後は自動的に削除されます。
      </Alert>
      <Checkbox
        checked={confirmed}
        onChange={(e) => setConfirmed(e.target.checked)}
        disabled={loading}
        label="削除範囲を理解し、復元できないことに同意します"
      />
      {error && (
        <Alert severity="error" sx={{ mt: 2 }} role="alert" data-testid="deletion-error">
          {error}
        </Alert>
      )}
    </ConfirmDialog>
  );
}
