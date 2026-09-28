/**
 * テスト共通の取引所マスタ入力（design.md §1.1・§1.4）。
 *
 * 参照実装・golden.py と同じ実際の値（JP: TSE 09:00-15:30 Asia/Tokyo、
 * US: NASDAQ・NYSE・AMEX 09:30-16:00 America/New_York）を、時刻の規則・市場への振り分けの
 * 両方に使う「取引所マスタ」として各テストへ渡す。市場は core の定数ではなく、この入力の
 * `market` 属性から決まる（design.md §1.1「取引所マスタの市場属性で決める」）。
 */
import type { ExchangeSessionInfo } from '../../../../src/forecast/time.js';

export const REAL_EXCHANGES: readonly ExchangeSessionInfo[] = [
  { exchangeId: 'TSE', market: 'JP', timezone: 'Asia/Tokyo', start: '09:00', end: '15:30' },
  {
    exchangeId: 'NASDAQ',
    market: 'US',
    timezone: 'America/New_York',
    start: '09:30',
    end: '16:00',
  },
  { exchangeId: 'NYSE', market: 'US', timezone: 'America/New_York', start: '09:30', end: '16:00' },
  { exchangeId: 'AMEX', market: 'US', timezone: 'America/New_York', start: '09:30', end: '16:00' },
];

/**
 * US の End を時間外取引込みの 20:00 にした代替設定（時刻の規則の方向性が、取引所マスタの
 * 具体的な時刻設定によらず成り立つことを確認するためのテスト専用フィクスチャ）。
 */
export const US_AFTER_HOURS_EXCHANGES: readonly ExchangeSessionInfo[] = REAL_EXCHANGES.map((e) =>
  e.market === 'US' ? { ...e, end: '20:00' } : e
);
