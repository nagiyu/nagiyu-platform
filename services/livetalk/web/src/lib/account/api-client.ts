/**
 * アカウント UI から `/api/account` を呼ぶための fetch ラッパ。
 *
 * コンポーネントから fetch を直接呼ばず、ここに集約してテスト可能にする
 * （カバレッジ計測対象は `src/lib/**` のみ）。
 */

export const ACCOUNT_API_ERROR_MESSAGES = {
  DELETE_FAILED: '退会処理に失敗しました。時間を置いて再度お試しください。',
} as const;

/**
 * アカウントを削除する（退会処理）。
 * 成功時は void を返し、失敗時は DELETE_FAILED エラーを throw する。
 */
export async function deleteAccount(): Promise<void> {
  const res = await fetch('/api/account', { method: 'DELETE' });
  if (!res.ok) throw new Error(ACCOUNT_API_ERROR_MESSAGES.DELETE_FAILED);
}
