import { ERROR_MESSAGES } from '@/lib/constants/errors';

/** 招待の承認に失敗したときの既定の文言。 */
export const ACCEPT_FAILURE_MESSAGE = '招待の承認に失敗しました。';

/** 招待の拒否に失敗したときの既定の文言。 */
export const REJECT_FAILURE_MESSAGE = '招待の拒否に失敗しました。';

/** 招待への応答に失敗した原因から決めた、画面の扱い。 */
export type InvitationFailure = {
  message: string;
  /** 招待が既に無効で、一覧に残しても操作できない場合 true */
  removeFromList: boolean;
};

/**
 * 招待への応答に失敗した応答から、利用者に見せる文言と一覧の扱いを決める。
 *
 * 人数上限と期限切れだけは利用者が対処を判断できる原因なので個別の文言を返し、それ以外は既定の文言にまとめる。
 * 期限切れの招待は承認も拒否もできないため、一覧から除く扱いにする。
 * 応答が JSON でない場合 (ゲートウェイのエラー等) も既定の文言に倒す。
 *
 * @param response - 失敗した応答
 * @param defaultMessage - 原因を特定できない場合の文言
 */
export async function resolveInvitationFailure(
  response: Pick<Response, 'json'>,
  defaultMessage: string
): Promise<InvitationFailure> {
  try {
    const body: unknown = await response.json();
    const code =
      typeof body === 'object' && body !== null ? (body as { error?: unknown }).error : undefined;
    if (code === 'MEMBER_LIMIT_EXCEEDED') {
      return { message: ERROR_MESSAGES.MEMBER_LIMIT_EXCEEDED, removeFromList: false };
    }
    if (code === 'INVITATION_EXPIRED') {
      return { message: ERROR_MESSAGES.INVITATION_EXPIRED, removeFromList: true };
    }
  } catch {
    // 本文を読めない場合は原因を特定できない
  }
  return { message: defaultMessage, removeFromList: false };
}
