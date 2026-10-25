import { ERROR_MESSAGES } from '@/lib/constants/errors';

/** 招待の承認に失敗したときの既定の文言。 */
export const ACCEPT_FAILURE_MESSAGE = '招待の承認に失敗しました。';

/**
 * 招待の承認に失敗した応答から、利用者に見せる文言を決める。
 *
 * 人数上限だけは利用者が対処を判断できる原因なので個別の文言を返し、それ以外は既定の文言にまとめる。
 * 応答が JSON でない場合 (ゲートウェイのエラー等) も既定の文言に倒す。
 */
export async function resolveAcceptFailureMessage(
  response: Pick<Response, 'json'>
): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (
      typeof body === 'object' &&
      body !== null &&
      (body as { error?: unknown }).error === 'MEMBER_LIMIT_EXCEEDED'
    ) {
      return ERROR_MESSAGES.MEMBER_LIMIT_EXCEEDED;
    }
  } catch {
    // 本文を読めない場合は原因を特定できない
  }
  return ACCEPT_FAILURE_MESSAGE;
}
