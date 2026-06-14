'use client';

import { useState, useCallback } from 'react';
import { signOut } from 'next-auth/react';
import { deleteAccount } from './api-client';

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
}

/**
 * アカウント削除（退会）ロジックを管理するカスタム hook。
 *
 * - `DELETE /api/account` を呼び出してデータを削除する
 * - 成功時は next-auth の signOut でセッションを破棄してトップ（/）へリダイレクトする
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
      await signOut({ redirectTo: '/' });
    } catch (e) {
      setError(e instanceof Error ? e.message : '退会処理に失敗しました。');
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, requestDeletion };
}
