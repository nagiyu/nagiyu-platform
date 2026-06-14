'use client';

import { useState, useCallback } from 'react';
import { signOut } from 'next-auth/react';
import { ACCOUNT_API_ERROR_MESSAGES, deleteAccount } from './api-client';
import { redirectToTop } from './navigation';

/**
 * useAccountDeletion の戻り値型。
 */
export interface UseAccountDeletionResult {
  /** 削除処理中かどうか */
  loading: boolean;
  /** 削除処理のエラーメッセージ（失敗時のみ非 null） */
  error: string | null;
  /** 退会処理を実行する。成功時は signOut してトップへリダイレクトする。 */
  requestDeletion: () => Promise<void>;
  /** エラー状態をクリアする（モーダルの開閉時に残留エラーを消すために使う）。 */
  clearError: () => void;
}

/**
 * アカウント削除（退会）ロジックを管理するカスタム hook。
 *
 * - `DELETE /api/account` を呼び出してデータを削除する
 * - 成功時は next-auth の signOut でセッションを破棄し、ブラウザ側でトップ（/）へ遷移する
 * - 失敗時はエラーメッセージをセットし、モーダルは開いたままにする
 */
export function useAccountDeletion(): UseAccountDeletionResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestDeletion = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await deleteAccount();
      // signOut のサーバ側リダイレクト解決はリバースプロキシ背後で内部ホスト名に化けるため使わない。
      // セッションだけ破棄し、遷移はブラウザ側（redirectToTop）で公開オリジンのトップへ移動する。
      await signOut({ redirect: false });
      redirectToTop();
    } catch (e) {
      setError(e instanceof Error ? e.message : ACCOUNT_API_ERROR_MESSAGES.DELETE_FAILED);
    } finally {
      setLoading(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { loading, error, requestDeletion, clearError };
}
