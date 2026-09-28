/**
 * Stock Tracker Core - MarketForecast Repository Interface
 *
 * 確度（市場×日）データの操作インターフェース（forecast.repository.interface.ts の市場版）
 */
import type {
  CreateMarketForecastInput,
  MarketForecastEntity,
  MarketForecastKey,
} from '../entities/market-forecast.entity.js';
import type { Market, MarketOutcome, MarketSample } from '../forecast/index.js';

/** `createIfAbsent` の結果。`created: false` は既に存在し、書き込まなかったことを示す */
export interface CreateMarketForecastResult {
  item: MarketForecastEntity;
  created: boolean;
}

/** `appendOutcome` の結果。`updated: false` は既に Outcome があり、書き込まなかったことを示す */
export interface AppendMarketForecastOutcomeResult {
  item: MarketForecastEntity;
  updated: boolean;
}

/**
 * MarketForecast Repository インターフェース
 *
 * DynamoDB実装とInMemory実装が共通で実装するインターフェース。
 * ForecastRepository と同じ「一度きりの条件付き書き込み」の方針に従う。
 */
export interface MarketForecastRepository {
  /**
   * MarketForecast を条件付きで新規作成する（`attribute_not_exists(PK)`）。
   * 既に存在する場合は書き込まず、既存のアイテムを `created: false` で返す。
   */
  createIfAbsent(input: CreateMarketForecastInput): Promise<CreateMarketForecastResult>;

  /**
   * 既存 MarketForecast に採点結果（Outcome）を条件付きで追記する
   * （`attribute_exists(PK) AND attribute_not_exists(Outcome)`）。
   * 既に Outcome がある場合は書き込まず、既存のアイテムを `updated: false` で返す。
   *
   * @throws {EntityNotFoundError} 対象の MarketForecast が存在しない場合
   */
  appendOutcome(
    key: MarketForecastKey,
    outcome: MarketOutcome
  ): Promise<AppendMarketForecastOutcomeResult>;

  /**
   * Market と Date で単一の MarketForecast を取得
   *
   * @returns MarketForecast（存在しない場合は null）
   */
  getByMarketAndDate(market: Market, date: string): Promise<MarketForecastEntity | null>;

  /**
   * 市場の MarketForecast を、期間（fromDate 以上・toDate 以下）でサンプル列
   * （{@link MarketSample}）として読み出す（学習・基準値・中立帯の算出用）。
   *
   * @param market - 対象の市場
   * @param fromDate - 開始日 (YYYY-MM-DD、含む)。省略時は全期間
   * @param toDate - 終了日 (YYYY-MM-DD、含む)。省略時は fromDate 以降の全期間
   * @returns サンプル列（Date 昇順）
   */
  getSamplesByDateRange(
    market: Market,
    fromDate?: string,
    toDate?: string
  ): Promise<MarketSample[]>;
}
