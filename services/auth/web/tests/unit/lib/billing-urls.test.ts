import {
  buildCheckoutUrls,
  buildPlansPath,
  buildPortalReturnUrl,
  buildRefreshPath,
  buildSignInPath,
} from '../../../src/lib/billing-urls';

const BASE = 'https://auth.nagiyu.com';
const CALLBACK = 'https://quick-clip.nagiyu.com/clips?x=1';
const ENCODED = encodeURIComponent(CALLBACK);

describe('billing-urls', () => {
  it('戻り先が無ければ callbackUrl を付けない', () => {
    expect(buildPlansPath(null)).toBe('/plans');
    expect(buildCheckoutUrls(BASE, null)).toEqual({
      successUrl: `${BASE}/plans?checkout=success`,
      cancelUrl: `${BASE}/plans`,
    });
    expect(buildPortalReturnUrl(BASE, null)).toBe(`${BASE}/plans`);
  });

  it('戻り先があれば成功時と中止時の両方に付ける', () => {
    expect(buildCheckoutUrls(BASE, CALLBACK)).toEqual({
      successUrl: `${BASE}/plans?checkout=success&callbackUrl=${ENCODED}`,
      cancelUrl: `${BASE}/plans?callbackUrl=${ENCODED}`,
    });
    expect(buildPortalReturnUrl(BASE, CALLBACK)).toBe(`${BASE}/plans?callbackUrl=${ENCODED}`);
  });

  it('決済直後の再取得は、戻り先が無ければプランの画面に戻す', () => {
    expect(buildRefreshPath(BASE, CALLBACK)).toBe(`/refresh?callbackUrl=${ENCODED}`);
    expect(buildRefreshPath(BASE, null)).toBe(
      `/refresh?callbackUrl=${encodeURIComponent(`${BASE}/plans`)}`
    );
  });

  it('サインイン後は今のプランの画面に戻す', () => {
    expect(buildSignInPath(null)).toBe(`/signin?callbackUrl=${encodeURIComponent('/plans')}`);
    expect(buildSignInPath(CALLBACK)).toBe(
      `/signin?callbackUrl=${encodeURIComponent(`/plans?callbackUrl=${ENCODED}`)}`
    );
  });
});
