const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;

const PLAIN_SECONDS_PATTERN = /^\d+(\.\d+)?$/;
const INTEGER_PATTERN = /^\d+$/;

/**
 * 秒を「m:ss」または「h:mm:ss」に整形する。
 * 端数は切り捨てる。1 時間未満は分を 0 埋めしない。
 *
 * @param seconds - 秒 (0 以上)
 */
export function formatHighlightTime(seconds: number): string {
  const total = Math.floor(Math.max(0, seconds));
  const hours = Math.floor(total / SECONDS_PER_HOUR);
  const minutes = Math.floor((total % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const secs = total % SECONDS_PER_MINUTE;
  const ss = String(secs).padStart(2, '0');

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${ss}`;
  }
  return `${minutes}:${ss}`;
}

/**
 * 入力文字列を秒に変換する。
 * 「m:ss」「h:mm:ss」と、コロン無しの秒の数値を受け付ける。秒の部分は小数でもよい。
 * コロン区切りの分・秒が 0〜59 の範囲外のもの、負数、空、数値でないものは null を返す。
 *
 * @param input - 入力文字列
 */
export function parseHighlightTime(input: string): number | null {
  const text = input.trim();
  if (text === '') {
    return null;
  }

  if (!text.includes(':')) {
    return PLAIN_SECONDS_PATTERN.test(text) ? Number(text) : null;
  }

  const parts = text.split(':');
  if (parts.length !== 2 && parts.length !== 3) {
    return null;
  }

  const secondsPart = parts[parts.length - 1];
  const leading = parts.slice(0, -1);
  if (!PLAIN_SECONDS_PATTERN.test(secondsPart) || !leading.every((p) => INTEGER_PATTERN.test(p))) {
    return null;
  }

  const secs = Number(secondsPart);
  const numbers = leading.map(Number);
  // 先頭が時のときだけ上限がない。分・秒は 60 未満でなければならない
  const minutes = numbers[numbers.length - 1];
  const hours = parts.length === 3 ? numbers[0] : 0;
  if (secs >= SECONDS_PER_MINUTE || minutes >= SECONDS_PER_MINUTE) {
    return null;
  }

  return hours * SECONDS_PER_HOUR + minutes * SECONDS_PER_MINUTE + secs;
}
