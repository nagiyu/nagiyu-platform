/**
 * Stock Tracker Core - Forecast Repository Interface
 *
 * 確度（銘柄×日）データの操作インターフェース
 */
import type {
  CreateForecastInput,
  ForecastEntity,
  ForecastKey,
} from '../entities/forecast.entity.js';
import type { TickerOutcome, TickerSample } from '../forecast/index.js';

/** `createIfAbsent` の結果。`created: false` は既に存在し、書き込まなかったことを示す */
export interface CreateForecastResult {
  /** 保存されている（今回作成した、または既存の）アイテム */
  item: ForecastEntity;
  /** 今回新規作成したか（false は既存のものをそのまま返した） */
  created: boolean;
}

/** `appendOutcome` の結果。`updated: false` は既に Outcome があり、書き込まなかったことを示す */
export interface AppendForecastOutcomeResult {
  /** 保存されている（Outcome を含む）アイテム */
  item: ForecastEntity;
  /** 今回 Outcome を追記したか（false は既存の Outcome をそのまま返した） */
  updated: boolean;
}

/**
 * Forecast Repository インターフェース
 *
 * DynamoDB実装とInMemory実装が共通で実装するインターフェース。
 * 画面に出した値を後から検証できるよう、予測部分（AxisValues〜BackfilledAxes）と Outcome は、
 * それぞれ一度きりの条件付き書き込みで作成・追記する。再実行しても既存の値を上書きしないため、
 * いずれも例外を投げず「書き込んだかどうか」を結果で返す（バッチが素直に再実行できるようにする）。
 */
export interface ForecastRepository {
  /**
   * Forecast を条件付きで新規作成する（`attribute_not_exists(PK)`）。
   * 既に存在する場合は書き込まず、既存のアイテムを `created: false` で返す。
   *
   * @param input - 予測部分の入力（Outcome は持てない）
   */
  createIfAbsent(input: CreateForecastInput): Promise<CreateForecastResult>;

  /**
   * 既存 Forecast に採点結果（Outcome）を条件付きで追記する
   * （`attribute_exists(PK) AND attribute_not_exists(Outcome)`）。
   * 既に Outcome がある場合は書き込まず、既存のアイテムを `updated: false` で返す。
   * 予測部分（AxisValues〜BackfilledAxes）は一切変更しない。
   *
   * @param key - 対象 Forecast のキー
   * @param outcome - 採点結果（{@link TickerOutcome}。識別子フィールドは無視する）
   * @throws {EntityNotFoundError} 対象の Forecast が存在しない場合
   */
  appendOutcome(key: ForecastKey, outcome: TickerOutcome): Promise<AppendForecastOutcomeResult>;

  /**
   * TickerID と Date で単一の Forecast を取得（詳細ダイアログ用）
   *
   * @returns Forecast（存在しない場合は null）
   */
  getByTickerAndDate(tickerId: string, date: string): Promise<ForecastEntity | null>;

  /**
   * 取引所IDと Date で同一取引所・同一日の Forecast 一覧を取得（サマリー一覧 API 用）
   *
   * GSI4（ExchangeSummaryIndex）を Query する。返却順序は TickerID 昇順を契約とする。
   */
  getByExchangeAndDate(exchangeId: string, date: string): Promise<ForecastEntity[]>;

  /**
   * 複数の取引所（= 1 つの市場）の Forecast を、期間（fromDate 以上・toDate 以下）で
   * サンプル列（{@link TickerSample}）として読み出す。取引所ごとに GSI4 を Query してまとめる。
   *
   * 学習・基準値・中立帯の算出（全期間を読むことがある）向けの読み出しで、寄与等の重い属性は
   * 落として返してよい（実装が軽量プロジェクションを使うかどうかは実装詳細）。
   *
   * @param exchangeIds - 対象の取引所ID一覧（1 つの市場に属するもの）
   * @param fromDate - 開始日 (YYYY-MM-DD、含む)。省略時は取引所内の全期間
   * @param toDate - 終了日 (YYYY-MM-DD、含む)。省略時は fromDate 以降の全期間
   * @returns サンプル列（取引所・日付の順序は保証しない。呼び出し側は順序に依存しないこと）
   */
  getSamplesByExchangesAndDateRange(
    exchangeIds: readonly string[],
    fromDate?: string,
    toDate?: string
  ): Promise<TickerSample[]>;
}
