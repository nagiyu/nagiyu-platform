/**
 * 確度 API の定数
 */

/**
 * Q-MKT を参考値として扱う採点済み日数のしきい値。
 * 市場ごとに 1 日 1 件しか溜まらないため、約 1 年分（250 営業日）が溜まるまでは
 * 確率帯ごとの実績が読めず、確率を額面どおり信じられない。
 */
export const LOW_SAMPLE_MKT_DAYS = 250;

/** 採点済み日数を数える範囲の開始日（全期間を指す番兵） */
export const EARLIEST_DATE = '0000-01-01';

/** 最新の ModelSnapshot を引くための、十分に未来の日付 */
export const LATEST_DATE = '9999-12-31';

/** 軸ごとの成績 API の既定値 */
export const AXIS_PERFORMANCE_DEFAULTS = {
  question: 'DIR',
  period: '90d',
  market: 'ALL',
} as const;

/** 直近 N 日の期間の日数（to を含む） */
export const PERIOD_DAYS = {
  '30d': 30,
  '90d': 90,
} as const;
