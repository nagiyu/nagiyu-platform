/**
 * Stock Tracker Core - Exchange Entity
 *
 * 取引所のビジネスオブジェクト（PK/SKを持たない純粋なエンティティ）
 */

/**
 * 現在価格の取得元データソース
 *
 * - tradingview: TradingView API（デフォルト、東証など全市場対応）
 * - finnhub: Finnhub API（米国株専用: NASDAQ/NYSE/AMEX）
 */
export type PriceSource = 'tradingview' | 'finnhub';

/** 有効なデータソース一覧 */
export const PRICE_SOURCES: readonly PriceSource[] = ['tradingview', 'finnhub'];

/** データソースのデフォルト値 */
export const DEFAULT_PRICE_SOURCE: PriceSource = 'tradingview';

/**
 * 取引所マスタが持つ「市場」属性の値
 *
 * 確度の算出（forecast/）が、同市場平均・観測カレンダー・市場の荒れの単位として扱う市場を
 * 表す。「同じ営業日カレンダーで、同じ時刻に引ける取引所のまとまり」を人が選ぶ選択式の値で、
 * 自由入力にはしない（市場が増えたときはこの定数を改修で足す）。
 *
 * 省略可能（未設定の取引所は確度算出の対象外）で、デフォルト値は持たない。
 */
export type ExchangeMarket = 'JP' | 'US';

/** 有効な市場一覧 */
export const EXCHANGE_MARKETS: readonly ExchangeMarket[] = ['JP', 'US'];

/** 市場コードと表示名の対応 */
export const EXCHANGE_MARKET_LABELS: Record<ExchangeMarket, string> = {
  JP: '日本',
  US: '米国',
};

/**
 * 取引所エンティティ
 *
 * DynamoDBの実装詳細（PK/SK）を含まない純粋なビジネスオブジェクト
 */
export interface ExchangeEntity {
  /** 取引所ID。1-50文字、英数字とハイフン、作成後変更不可 */
  exchangeId: string;
  /** 取引所名。1-200文字 */
  name: string;
  /** TradingView API用キー。1-20文字、英大文字と数字のみ、作成後変更不可 (TickerID の生成に使う) */
  key: string;
  /** タイムゾーン (IANA形式) */
  timezone: string;
  /** 取引開始時刻 (HH:MM形式)。時間外取引を含む */
  start: string;
  /** 取引終了時刻 (HH:MM形式)。時間外取引を含む */
  end: string;
  /**
   * 現在価格の取得元。既定 tradingview
   *
   * - tradingview: TradingView API（東証など全市場対応）
   * - finnhub: Finnhub API（米国株専用: NASDAQ/NYSE/AMEX）
   */
  priceSource: PriceSource;
  /**
   * 市場（省略可能。未設定の取引所は確度算出の対象外）
   *
   * - JP: 日本
   * - US: 米国
   */
  market?: ExchangeMarket;
  /** 作成日時 (Unix timestamp ミリ秒) */
  createdAt: number;
  /** 更新日時 (Unix timestamp ミリ秒) */
  updatedAt: number;
}

/**
 * Exchange作成時の入力データ (createdAt/updatedAtを含まない)
 */
export type CreateExchangeInput = Omit<ExchangeEntity, 'createdAt' | 'updatedAt'>;

/**
 * Exchange更新時の入力データ（更新可能なフィールドのみ）
 *
 * market は他の省略可能フィールドと異なりデフォルト値を持たないため、
 * `undefined`（更新しない）と `null`（未設定に戻す）を区別する。
 */
export type UpdateExchangeInput = Partial<
  Pick<ExchangeEntity, 'name' | 'timezone' | 'start' | 'end' | 'priceSource'>
> & {
  /** 市場。undefined: 更新しない、null: 未設定に戻す、値: その市場に設定する */
  market?: ExchangeMarket | null;
};

/**
 * Exchangeのビジネスキー
 */
export interface ExchangeKey {
  exchangeId: string;
}
