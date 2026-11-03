import { sanitizeCallbackUrl } from '../../../src/lib/callback-url';

const BASE = 'https://auth.nagiyu.com';

describe('sanitizeCallbackUrl', () => {
  it.each([null, undefined, ''])('値が無ければ null (%s)', (raw) => {
    expect(sanitizeCallbackUrl(raw, BASE)).toBeNull();
  });

  it('nagiyu.com 配下の URL は許可する', () => {
    expect(sanitizeCallbackUrl('https://quick-clip.nagiyu.com/clips?x=1', BASE)).toBe(
      'https://quick-clip.nagiyu.com/clips?x=1'
    );
  });

  it('dev の dev.nagiyu.com 配下も許可する', () => {
    expect(sanitizeCallbackUrl('https://quick-clip.dev.nagiyu.com/', BASE)).toBe(
      'https://quick-clip.dev.nagiyu.com/'
    );
  });

  it('auth 内の相対パスは絶対 URL にして許可する', () => {
    expect(sanitizeCallbackUrl('/dashboard?a=1', BASE)).toBe(
      'https://auth.nagiyu.com/dashboard?a=1'
    );
  });

  it.each([
    'https://evil.example.com/',
    'https://auth.nagiyu.com.evil.com/',
    'javascript:alert(1)',
    '//evil.example.com/',
    '/\\evil.example.com/',
    'plans',
  ])('許可されない値は null (%s)', (raw) => {
    expect(sanitizeCallbackUrl(raw, BASE)).toBeNull();
  });

  it.each([
    '/\t/evil.example.com/',
    '/\n/evil.example.com/',
    '/\r/evil.example.com/',
    '/\t\\evil.example.com/',
  ])('タブや改行が取り除かれて別オリジンになる相対パスは null (%j)', (raw) => {
    // URL パーサーが制御文字を取り除くと `//evil.example.com/` になる
    expect(new URL(raw, BASE).origin).not.toBe(BASE);
    expect(sanitizeCallbackUrl(raw, BASE)).toBeNull();
  });

  it('パーセントエンコードされたタブはただのパスとして扱い、自サービス内に留める', () => {
    expect(sanitizeCallbackUrl('/%09/evil.example.com/', BASE)).toBe(
      'https://auth.nagiyu.com/%09/evil.example.com/'
    );
  });

  it('解釈できない相対パスは null', () => {
    expect(sanitizeCallbackUrl('/ok', 'not a url')).toBeNull();
  });
});
