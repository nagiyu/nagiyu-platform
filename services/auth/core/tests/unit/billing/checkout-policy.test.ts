import { canStartCheckout } from '../../../src/billing/checkout-policy';

describe('canStartCheckout', () => {
  describe('本番', () => {
    it.each([
      ['ロールなし', []],
      ['ロールあり', ['billing-tester']],
      ['未ログイン', undefined],
    ])('制限をかけない (%s)', (_label, roles) => {
      expect(canStartCheckout('prod', roles)).toBe(true);
    });
  });

  describe.each([
    ['dev', 'dev'],
    ['未設定', undefined],
    ['空文字', ''],
    ['想定外の値', 'production'],
  ])('本番以外 (%s)', (_label, env) => {
    it('billing:test を持つロールなら許す', () => {
      expect(canStartCheckout(env, ['billing-tester'])).toBe(true);
    });

    it('billing:test を持たないロールなら断る', () => {
      expect(canStartCheckout(env, ['admin', 'user-manager'])).toBe(false);
    });

    it('ロールが無ければ断る', () => {
      expect(canStartCheckout(env, [])).toBe(false);
    });

    it('未ログインなら断る', () => {
      expect(canStartCheckout(env, undefined)).toBe(false);
    });
  });
});

describe('billing の index', () => {
  it('canStartCheckout を外から使える形で export する', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const billing = require('../../../src/billing') as Record<string, unknown>;

    expect(billing.canStartCheckout).toBe(canStartCheckout);
  });
});
