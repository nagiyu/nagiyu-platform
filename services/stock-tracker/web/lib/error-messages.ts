/**
 * Stock Tracker固有のエラーメッセージ
 *
 * @nagiyu/common の共通エラーメッセージに加えて、
 * Stock Tracker固有のエラーコードをマッピングする
 */

/**
 * Stock Tracker固有のエラーメッセージマッピング
 * APIエラーコードをユーザーフレンドリーな日本語メッセージに変換
 */
export const STOCK_TRACKER_ERROR_MESSAGES = {
  // ティッカー関連エラー
  TICKER_NOT_FOUND: 'ティッカーシンボルが見つかりませんでした',
  TICKER_ALREADY_EXISTS: '既に登録されているティッカーシンボルです',
  INVALID_TICKER: 'ティッカーシンボルの形式が不正です',

  // マーケット関連エラー
  MARKET_CLOSED: '市場が閉まっています。取引時間中に再度お試しください',
  MARKET_DATA_UNAVAILABLE: '市場データが利用できません',

  // ウォッチリスト関連エラー
  WATCHLIST_FULL: 'ウォッチリストが上限に達しています',
  WATCHLIST_DUPLICATE: '既にウォッチリストに追加されています',

  // ホールディング関連エラー
  HOLDING_NOT_FOUND: '保有銘柄が見つかりませんでした',
  INSUFFICIENT_HOLDINGS: '保有数量が不足しています',
  INVALID_QUANTITY: '数量が不正です',
  INVALID_PRICE: '価格が不正です',

  // アラート関連エラー
  ALERT_NOT_FOUND: 'アラートが見つかりませんでした',
  ALERT_LIMIT_EXCEEDED: 'アラートの登録上限に達しています',
  INVALID_THRESHOLD: '閾値が不正です',

  // データ取得エラー
  CHART_DATA_ERROR: 'チャートデータの取得に失敗しました',
  PRICE_DATA_ERROR: '価格データの取得に失敗しました',
  EXCHANGE_DATA_ERROR: '取引所データの取得に失敗しました',
} as const;
