import { TIMEFRAME_LABELS, type Timeframe } from '../types/stock';

/**
 * トップ画面の選択状態を URL クエリと相互変換する。
 *
 * 選択を URL に載せることで、リロードや共有・ブックマークで同じ画面を再現できる。
 * 対象は取引所・銘柄・時間枠のみで、それ以外のクエリは触らない。
 */

/** 時間枠の既定値。既定値のときは URL に載せず、URL を短く保つ */
export const DEFAULT_TIMEFRAME: Timeframe = '60';

const QUERY_KEYS = {
  EXCHANGE_ID: 'exchangeId',
  TICKER_ID: 'tickerId',
  TIMEFRAME: 'timeframe',
} as const;

const TIMEFRAMES = Object.keys(TIMEFRAME_LABELS) as Timeframe[];

/** トップ画面の選択状態 (未選択は空文字) */
export interface HomeSelection {
  exchangeId: string;
  tickerId: string;
  timeframe: Timeframe;
}

/**
 * クエリ値を時間枠として解釈する。
 * 手入力された URL は不正値を含みうるため、`Timeframe` に含まれない値は既定値に落とす。
 */
export function parseTimeframe(value: string | null | undefined): Timeframe {
  return TIMEFRAMES.find((timeframe) => timeframe === value) ?? DEFAULT_TIMEFRAME;
}

/**
 * 選択状態を反映した遷移先を組み立てる。いまの URL と同じ場合は null を返す。
 *
 * 選択のたびに履歴を積まないよう呼び出し側は replace で使う前提で、同じ URL への
 * 無駄な遷移を避けるために null を返す。管轄外のクエリは順序ごと保持する。
 *
 * @param pathname - 現在のパス
 * @param currentSearch - 現在のクエリ文字列 (先頭の `?` は有無どちらでもよい)
 * @param selection - 反映する選択状態
 * @returns 遷移先 (`pathname` または `pathname?query`)。変更が不要なら null
 */
export function buildHomeUrl(
  pathname: string,
  currentSearch: string,
  selection: HomeSelection
): string | null {
  const current = new URLSearchParams(currentSearch);
  const next = new URLSearchParams(currentSearch);

  const entries: Array<[string, string]> = [
    [QUERY_KEYS.EXCHANGE_ID, selection.exchangeId],
    [QUERY_KEYS.TICKER_ID, selection.tickerId],
    [QUERY_KEYS.TIMEFRAME, selection.timeframe === DEFAULT_TIMEFRAME ? '' : selection.timeframe],
  ];

  for (const [key, value] of entries) {
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
  }

  // 生のクエリ文字列ではなく正規化後の文字列で比べ、エンコード表記の違いだけでは遷移しない
  const nextQuery = next.toString();
  if (nextQuery === current.toString()) {
    return null;
  }
  return nextQuery ? `${pathname}?${nextQuery}` : pathname;
}
