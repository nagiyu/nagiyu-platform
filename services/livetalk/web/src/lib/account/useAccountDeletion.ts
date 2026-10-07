'use client';

import { useState, useCallback } from 'react';
import { ACCOUNT_API_ERROR_MESSAGES, deleteAccount } from './api-client';
import { redirectToSignOut } from './navigation';

/**
 * useAccountDeletion の戻り値型。
 */
export interface UseAccountDeletionResult {
  /** 削除処理中かどうか */
  loading: boolean;
  /** 削除処理のエラーメッセージ（失敗時のみ非 null） */
  error: string | null;
  /** 退会処理を実行する。成功時は auth サービスのサインアウト URL へ遷移する。 */
  requestDeletion: () => Promise<void>;
  /** エラー状態をクリアする（モーダルの開閉時に残留エラーを消すために使う）。 */
  clearError: () => void;
}

/**
 * アカウント削除（退会）ロジックを管理するカスタム hook。
 *
 * - `DELETE /api/account` を呼び出してデータを削除する
 * - 成功時は auth サービスのサインアウト URL へブラウザ側で遷移し、セッションを破棄する
 * - 失敗時はエラーメッセージをセットし、モーダルは開いたままにする
 *
 * @param authUrl - auth サービスのベース URL（ヘッダーのサインアウトと同じ値）
 */
export function useAccountDeletion(authUrl: string): UseAccountDeletionResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestDeletion = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await deleteAccount();
      // サインアウトは Cookie 発行元の auth サービスに集約しており、自サービスは signout の POST を
      // 受け付けない（next-auth の signOut は 405 になる）。ヘッダーのサインアウトと同じ遷移に揃える。
      redirectToSignOut(authUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : ACCOUNT_API_ERROR_MESSAGES.DELETE_FAILED);
    } finally {
      setLoading(false);
    }
  }, [authUrl]);

  const clearError = useCallback(() => setError(null), []);

  return { loading, error, requestDeletion, clearError };
}
