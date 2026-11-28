export const USER_ROLES_CLIENT_MESSAGES = {
  REQUEST_FAILED: '通信に失敗しました。時間をおいてもう一度お試しください',
  ASSIGN_FAILED: 'ロールの割り当てに失敗しました',
} as const;

export type SaveUserRolesResult = { ok: true } | { ok: false; message: string };

/**
 * ユーザーのロールと権利の変更を保存する。
 * 502/504 などで応答が HTML になっても英語の JSON パースエラーを画面に出さないよう、
 * 例外を投げずに結果として返す。
 */
export async function saveUserRoles(userId: string, body: unknown): Promise<SaveUserRolesResult> {
  let response: Response;
  try {
    response = await fetch(`/api/users/${encodeURIComponent(userId)}/roles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, message: USER_ROLES_CLIENT_MESSAGES.REQUEST_FAILED };
  }

  if (response.ok) {
    return { ok: true };
  }

  const data: { error?: unknown } | null = await response.json().catch(() => null);
  const message =
    typeof data?.error === 'string' ? data.error : USER_ROLES_CLIENT_MESSAGES.ASSIGN_FAILED;
  return { ok: false, message };
}
