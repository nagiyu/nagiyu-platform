'use client';

import { Alert, AlertTitle } from '@mui/material';

/**
 * エラーアラートコンポーネントのプロパティ
 */
export interface ErrorAlertProps {
  /**
   * エラーメッセージ
   */
  message: string;
  /**
   * エラーのタイトル（省略可能）
   */
  title?: string;
  /**
   * マージン設定
   */
  sx?: object;
  /**
   * エラーの重大度
   */
  severity?: 'error' | 'warning' | 'info';
}

/**
 * エラーアラートコンポーネント
 *
 * 統一されたエラー表示を提供します。
 * アクセシビリティ対応として、role="alert"とaria-live="assertive"を設定しています。
 */
export default function ErrorAlert({ message, title, sx, severity = 'error' }: ErrorAlertProps) {
  if (!message) {
    return null;
  }

  return (
    <Alert
      severity={severity}
      sx={{ mb: 2, ...sx }}
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
    >
      {title && <AlertTitle>{title}</AlertTitle>}
      {message}
    </Alert>
  );
}
