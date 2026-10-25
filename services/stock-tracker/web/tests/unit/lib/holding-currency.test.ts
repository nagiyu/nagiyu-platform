import { resolveInitialCurrency } from '../../../lib/holding-currency';

describe('resolveInitialCurrency', () => {
  const exchanges = [
    { exchangeId: 'TSE', market: 'JP' as const },
    { exchangeId: 'NASDAQ', market: 'US' as const },
    { exchangeId: 'NOMARKET' },
    { exchangeId: 'NULLMARKET', market: null },
    { exchangeId: 'UNKNOWNMARKET', market: 'XX' as unknown as 'JP' },
  ];

  it('日本市場の取引所では JPY を返す', () => {
    expect(resolveInitialCurrency(exchanges, 'TSE')).toBe('JPY');
  });

  it('米国市場の取引所では USD を返す', () => {
    expect(resolveInitialCurrency(exchanges, 'NASDAQ')).toBe('USD');
  });

  it('市場が未設定 (undefined) の取引所では空文字を返す', () => {
    expect(resolveInitialCurrency(exchanges, 'NOMARKET')).toBe('');
  });

  it('市場が未設定 (null) の取引所では空文字を返す', () => {
    expect(resolveInitialCurrency(exchanges, 'NULLMARKET')).toBe('');
  });

  it('取引所が未選択 (空文字) の場合は空文字を返す', () => {
    expect(resolveInitialCurrency(exchanges, '')).toBe('');
  });

  it('一覧に無い取引所の場合は空文字を返す', () => {
    expect(resolveInitialCurrency(exchanges, 'UNKNOWN')).toBe('');
  });

  it('未知の市場コードの取引所では空文字を返す', () => {
    expect(resolveInitialCurrency(exchanges, 'UNKNOWNMARKET')).toBe('');
  });
});
