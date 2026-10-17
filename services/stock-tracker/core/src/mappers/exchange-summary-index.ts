/**
 * Stock Tracker Core - ExchangeSummaryIndex (GSI4) のソートキー
 *
 * DailySummary と Forecast は同じ GSI4 を共有し、ソートキーを同じ形式で作る。
 * 形式の知識を 1 か所に置き、Mapper と独自クエリの両方が同じ関数でキー値を組み立てる。
 */

/**
 * アイテムの GSI4SK を構築する
 *
 * 日付昇順、同日内はティッカーID昇順で並ぶ。
 *
 * @param date - 取引日 (YYYY-MM-DD)
 * @param tickerId - ティッカーID
 * @returns GSI4SK
 */
export function buildExchangeSummaryGsi4Sk(date: string, tickerId: string): string {
  return `DATE#${date}#${tickerId}`;
}

/**
 * ある日付のアイテムすべてに前方一致する GSI4SK の接頭辞を構築する。
 * 範囲検索の下限にも使える。
 *
 * @param date - 取引日 (YYYY-MM-DD)
 * @returns GSI4SK の接頭辞
 */
export function buildExchangeSummaryGsi4DatePrefix(date: string): string {
  return `DATE#${date}`;
}

/**
 * ある日付までを含む範囲検索の上限となる GSI4SK を構築する。
 *
 * GSI4SK は `DATE#{date}#{tickerId}` のため、`DATE#{date}` だけを上限にすると
 * その日のアイテムが範囲から漏れる。ASCII 印字可能文字でほぼ最大の `~` (0x7E) を
 * 末尾に付けて、その日のすべてのティッカーIDより大きくする。
 * `~` より大きいコードポイントを含むティッカーIDは、その日の分が漏れる。
 * 現行のティッカーID体系 (`NSDQ:AAPL` 形式) では起こらない。
 *
 * @param date - 取引日 (YYYY-MM-DD)
 * @returns 範囲の上限となる GSI4SK
 */
export function buildExchangeSummaryGsi4DateUpperBound(date: string): string {
  return `DATE#${date}#~`;
}
