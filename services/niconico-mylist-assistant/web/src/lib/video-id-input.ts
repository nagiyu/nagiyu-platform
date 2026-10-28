/**
 * 動画 URL の先頭部分。ニコニコ動画の watch URL と短縮 URL (nico.ms) を、
 * スキームの有無・サブドメイン (www / sp など) を問わず受け付ける。
 */
const VIDEO_URL_PATTERN =
  /^(?:https?:\/\/)?(?:[a-z0-9-]+\.)*(?:nicovideo\.jp\/watch\/|nico\.ms\/(?:watch\/)?)([a-z]+\d+)(?:[/?#&].*)?$/i;

/** 大文字を含みうる動画 ID の形。小文字にすれば受け付けられるものだけを小文字にする */
const CASE_INSENSITIVE_VIDEO_ID_PATTERN = /^[a-z]+\d+$/i;

/** 動画 ID の区切り。改行・空白・カンマに加え、全角の読点・カンマ・空白も区切りとして扱う */
const SEPARATOR_PATTERN = /[\s,、，\u3000]+/;

/**
 * 入力欄の文字列を、サーバーへ送る動画 ID の配列に整える。
 *
 * サーバーの検証は厳密なまま保つため、ここでは URL からの ID 抽出と小文字化だけを行う。
 * 整えても形式に合わないものは入力のまま返し、サーバー側の不正 ID として入力どおりに表示させる。
 *
 * @param input 入力欄の文字列
 */
export function normalizeVideoIdInput(input: string): string[] {
  return input
    .split(SEPARATOR_PATTERN)
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .map((token) => {
      const match = VIDEO_URL_PATTERN.exec(token);
      const candidate = match ? match[1] : token;
      return CASE_INSENSITIVE_VIDEO_ID_PATTERN.test(candidate)
        ? candidate.toLowerCase()
        : candidate;
    });
}

/**
 * 不正な動画 ID を、表示する先頭の数件と残りの件数に分ける。
 *
 * @param ids 不正な動画 ID
 * @param displayCount 表示する最大件数
 */
export function summarizeInvalidIds(
  ids: string[],
  displayCount: number
): { shown: string[]; remaining: number } {
  return {
    shown: ids.slice(0, displayCount),
    remaining: Math.max(ids.length - displayCount, 0),
  };
}
