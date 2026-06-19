/**
 * ニコニコ動画セッション検証ユーティリティ
 *
 * user_session クッキーの有効性を HTTP リクエストで確認する。
 * ブラウザ不要の軽量実装。
 */

/**
 * セッション検証の結果
 *
 * - valid: セッションが有効（ログイン済み）
 * - invalid: セッションが無効（未ログイン・期限切れ）
 * - unknown: 判定不能（ニコニコ側の障害・ネットワークエラー等）
 *   ※ unknown を invalid と混同しないこと（一時障害で全ロックアウトを防ぐため）
 */
export type SessionValidationResult = 'valid' | 'invalid' | 'unknown';

/**
 * セッション検証エラーメッセージ定数
 */
export const SESSION_VALIDATION_ERROR_MESSAGES = {
  /** セッションが無効（未ログイン）の場合のメッセージ */
  SESSION_INVALID:
    'user_session が無効です。シークレット窓でニコニコ動画にログインし、最新の user_session を取得してください',
  /** セッション検証でネットワークエラーが発生した場合のメッセージ */
  SESSION_VALIDATION_NETWORK_ERROR: 'セッション検証中にネットワークエラーが発生しました',
} as const;

/**
 * セッション検証に使用するURL
 * マイリストページへのリクエストでログイン状態を確認する
 */
const SESSION_VALIDATION_URL = 'https://www.nicovideo.jp/my/mylist';

/**
 * ブラウザ風のUser-Agent（ニコニコのbot判定を避けるため）
 */
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * ニコニコ動画のログインページのホスト
 */
const LOGIN_HOST = 'account.nicovideo.jp';

/**
 * user_session クッキーの有効性を検証する
 *
 * 実装仕様:
 * - `https://www.nicovideo.jp/my/mylist` を手動リダイレクト（redirect: 'manual'）で GET する
 * - 200: 有効（ログイン済み）
 * - 302 かつ Location が account.nicovideo.jp/login を含む: 無効（未ログイン）
 * - それ以外（5xx・ネットワーク失敗・想定外のステータス）: 判定不能（unknown）
 *
 * @param userSession - 検証対象の user_session クッキー値
 * @returns セッション検証結果（'valid' | 'invalid' | 'unknown'）
 */
export async function validateUserSession(
  userSession: string
): Promise<SessionValidationResult> {
  try {
    const response = await fetch(SESSION_VALIDATION_URL, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        Cookie: `user_session=${userSession}`,
        'User-Agent': USER_AGENT,
      },
    });

    const status = response.status;

    if (status === 200) {
      return 'valid';
    }

    if (status === 302) {
      const location = response.headers.get('Location') ?? '';
      if (location.includes(LOGIN_HOST)) {
        return 'invalid';
      }
      // 302だがログインページ以外へのリダイレクト（予期しないケース）
      return 'unknown';
    }

    // 5xx や予期しないステータスコード
    return 'unknown';
  } catch {
    // ネットワークエラー・DNS解決失敗等
    return 'unknown';
  }
}
