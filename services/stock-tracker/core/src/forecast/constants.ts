/**
 * Stock Tracker Core - Forecast (確度) 定数
 *
 * tasks/stock-tracker-v4/design.md §1・§2.3 および
 * tasks/stock-tracker-v4/analysis/{prep,wf,decision,decision2}.py（参照実装）と対応する定数を集約する。
 *
 * 実データを扱う定数（休場日コピー足の日付リスト等）もここに置く。DB には持たない（設計 §1.2）。
 */

/** 市場 */
export type Market = 'JP' | 'US';

/** 問い */
export type Question = 'DIR' | 'VOL' | 'MKT';

export const MARKETS: readonly Market[] = ['JP', 'US'];
export const QUESTIONS: readonly Question[] = ['DIR', 'VOL', 'MKT'];

/**
 * 算出ロジックの版（軸定義・方式の変更を追えるように。design.md §2.3 ModelVersion）
 */
export const FORECAST_MODEL_VERSION = 'forecast-core-v1';

/**
 * 市場と ExchangeID の対応（design.md §1.1 ADR-V4-01）
 */
export const JP_EXCHANGE_IDS: readonly string[] = ['TSE'];
export const US_EXCHANGE_IDS: readonly string[] = ['NASDAQ', 'NYSE', 'AMEX'];

/**
 * 名目セッション時刻（時間外取引を含む取引所マスタの Start/End は使わない。design.md 必読メモ）
 * 参照実装 prep.py の TZ / OPEN / CLOSE と同じ値。
 */
export const SESSION_TIMEZONE: Record<Market, string> = {
  JP: 'Asia/Tokyo',
  US: 'America/New_York',
};
export const SESSION_OPEN_TIME: Record<Market, string> = {
  JP: '09:00',
  US: '09:30',
};
export const SESSION_CLOSE_TIME: Record<Market, string> = {
  JP: '15:30',
  US: '16:00',
};

/** 平常の算出窓（値幅・出来高。design.md §1.1） */
export const NORMAL_WINDOW = 20;

/** Parkinson の算出窓（直近 N 日。design.md §1.2） */
export const PARKINSON_WINDOW = 5;

/** 採点から除外する極端リターンの閾値（|リターン| > 20%。design.md §1.1 FR-14） */
export const EXTREME_RETURN_THRESHOLD = 0.2;

/** 基準値（rolling_base）の窓・最小件数・クリップ範囲（design.md §1.5） */
export const BASELINE_WINDOW = 60;
export const BASELINE_MIN_COUNT = 20;
export const BASELINE_CLIP_MIN = 0.02;
export const BASELINE_CLIP_MAX = 0.98;

/** バーンイン: 学習サンプルの異なる日付がこれ未満なら確率を出さない */
export const MIN_TRAINING_DATES = 30;

/** L2 正則化係数（design.md §1.4） */
export const REGULARIZATION_ALPHA: Record<Question, number> = {
  DIR: 80,
  VOL: 20,
  MKT: 20,
};

/** IRLS（ニュートン法）の収束条件 */
export const IRLS_MAX_ITERATIONS = 50;
export const IRLS_STEP_TOLERANCE = 1e-8;

/** logit/sigmoid のクリップ（参照実装 wf.py の EPS = 1e-6 と同じ） */
export const LOGIT_EPSILON = 1e-6;

/** 中立帯（design.md §1.5） */
export const NEUTRAL_BAND_STEP: Record<Question, number> = {
  DIR: 0.05,
  VOL: 0.05,
  MKT: 0.1,
};
export const NEUTRAL_BAND_MIN_COUNT: Record<Question, number> = {
  DIR: 30,
  VOL: 30,
  MKT: 10,
};
export const NEUTRAL_BAND_MIN_DIFF = 0.03;
export const NEUTRAL_BAND_SIGNIFICANCE_LEVEL = 0.05;
export const NEUTRAL_BAND_REVIEW_INTERVAL_DAYS = 30;

/**
 * 中立帯の寄りなし側の番兵値（±∞ の代わり）。
 * DynamoDB/JSON に Infinity を保存できないため、番兵値で「無限」を表す（design.md §10）。
 */
export const NEUTRAL_BAND_SENTINEL_LOWER = -1;
export const NEUTRAL_BAND_SENTINEL_UPPER = 1;

/** 確率帯（同じ確率帯の過去実績）の刻み幅（design.md §1.5、参照実装 wf.py calib_table） */
export const PROBABILITY_BAND_STEP = 0.05;

/** 点灯型軸の件数不足の目印のしきい値（design.md §1.4） */
export const LOW_SAMPLE_AXIS_THRESHOLD = 30;

/**
 * #3830 の過去データ除外リスト（休場日コピー足の日付）。
 * 初期値算出（FR-13）で旧 DailySummary を読むときだけ適用する（design.md 必読メモ・§1.1）。
 * 参照実装 analysis/prep.py の HOLIDAY_COPIES と同じ値。
 */
export const LEGACY_BACKFILL_HOLIDAY_COPY_DATES: Record<Market, readonly string[]> = {
  JP: [
    '2026-03-20',
    '2026-04-29',
    '2026-05-04',
    '2026-05-05',
    '2026-05-06',
    '2026-07-20',
    '2026-08-11',
    '2026-09-21',
    '2026-09-22',
    '2026-09-23',
  ],
  US: ['2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07'],
};

/**
 * Forecast 系のエラーメッセージ（日本語 + 定数化）
 */
export const FORECAST_ERROR_MESSAGES = {
  UNKNOWN_EXCHANGE: '未対応の取引所IDです',
  INVALID_TIME_FORMAT: '無効な時刻形式です。HH:MM形式で指定してください',
  SINGULAR_MATRIX: 'IRLS の連立方程式が特異行列のため解けません',
  EMPTY_BAND_HISTORY: '中立帯の判定に使える帯がありません',
} as const;
