/**
 * Stock Tracker固有のエラーメッセージ
 *
 * 共通ライブラリのmapAPIErrorToMessageに第2引数として渡すことで、
 * Stock Tracker固有のエラーコードをユーザーフレンドリーなメッセージに変換します。
 */

/**
 * Stock Tracker固有のエラーメッセージマッピング
 */
export const STOCK_TRACKER_ERROR_MESSAGES = {
  // ティッカー関連
  TICKER_NOT_FOUND: 'ティッカーが見つかりませんでした',
  INVALID_TICKER: '無効なティッカーシンボルです',

  // 市場関連
  MARKET_CLOSED: '市場は現在閉場しています',
  MARKET_DATA_UNAVAILABLE: '市場データが利用できません',

  // データ取得関連
  CHART_DATA_ERROR: 'チャートデータの取得に失敗しました',
  PRICE_DATA_ERROR: '価格データの取得に失敗しました',
  HISTORICAL_DATA_ERROR: '過去データの取得に失敗しました',

  // ウォッチリスト関連
  WATCHLIST_NOT_FOUND: 'ウォッチリストが見つかりませんでした',
  WATCHLIST_LIMIT_EXCEEDED: 'ウォッチリストの登録上限に達しています',
  TICKER_ALREADY_IN_WATCHLIST: 'このティッカーは既にウォッチリストに登録されています',

  // ホールディング関連
  HOLDING_NOT_FOUND: 'ホールディングが見つかりませんでした',
  INVALID_QUANTITY: '無効な数量です',
  INVALID_PRICE: '無効な価格です',

  // アラート関連
  ALERT_NOT_FOUND: 'アラートが見つかりませんでした',
  ALERT_LIMIT_EXCEEDED: 'アラートの登録上限に達しています',
  INVALID_ALERT_CONDITION: '無効なアラート条件です',

  // 取引所関連
  EXCHANGE_NOT_FOUND: '取引所が見つかりませんでした',
  EXCHANGE_DATA_ERROR: '取引所データの取得に失敗しました',

  // プッシュ通知関連
  PUSH_SUBSCRIPTION_FAILED: 'プッシュ通知の登録に失敗しました',
  PUSH_UNSUBSCRIPTION_FAILED: 'プッシュ通知の解除に失敗しました',
  VAPID_KEY_ERROR: 'VAPID公開鍵の取得に失敗しました',
} as const;
