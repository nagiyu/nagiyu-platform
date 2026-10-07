import { shouldLoadAdsense } from '../../../src/lib/adsense';

describe('shouldLoadAdsense', () => {
  it('prod の場合は true を返すこと', () => {
    expect(shouldLoadAdsense('prod')).toBe(true);
  });

  it('dev の場合は false を返すこと', () => {
    expect(shouldLoadAdsense('dev')).toBe(false);
  });

  it('未設定の場合は false を返すこと', () => {
    expect(shouldLoadAdsense(undefined)).toBe(false);
  });

  it('空文字の場合は false を返すこと', () => {
    expect(shouldLoadAdsense('')).toBe(false);
  });

  it.each(['production', 'PROD', ' prod', 'staging'])(
    '想定外の値 "%s" の場合は false を返すこと',
    (value) => {
      expect(shouldLoadAdsense(value)).toBe(false);
    }
  );
});
