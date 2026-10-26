/**
 * チャット送信失敗時に画面へ出す文言。
 * サーバーの固定文言やエラーコードをそのまま見せず、キャラ共通のやわらかい言葉に置き換える。
 */
export const CHAT_ERROR_MESSAGES = {
  RATE_LIMIT_EXCEEDED:
    'たくさん話してくれてありがとう。ちょっとだけ休憩させてね。少し時間を置いてからまた話しかけてね',
  CONCURRENT_REQUEST: 'いま別のお返事を考えてるところだよ。終わるまで少し待ってね',
  GENERIC: 'ちょっとごめんね、今うまく話せないみたい。少ししてからもう一度話しかけてね',
} as const;

/**
 * エラーコードを画面に出す文言へ引き当てる。
 * 知らないコード・コードなしは汎用文言にする。
 */
export function getChatErrorMessage(code?: string | null): string {
  if (code === 'RATE_LIMIT_EXCEEDED') return CHAT_ERROR_MESSAGES.RATE_LIMIT_EXCEEDED;
  if (code === 'CONCURRENT_REQUEST') return CHAT_ERROR_MESSAGES.CONCURRENT_REQUEST;
  return CHAT_ERROR_MESSAGES.GENERIC;
}

/**
 * HTTP エラーレスポンスから `error` コードを読み取る。
 * 本文が JSON でない・形が違う場合は null を返し、呼び出し側を落とさない。
 */
export async function readChatErrorCode(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === 'object' && 'error' in body) {
      const code = (body as { error: unknown }).error;
      return typeof code === 'string' ? code : null;
    }
  } catch {
    // 本文が読めなくても汎用文言で続行する
  }
  return null;
}
