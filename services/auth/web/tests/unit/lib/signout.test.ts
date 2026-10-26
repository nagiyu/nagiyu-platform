/**
 * サインアウト確認画面の戻り先解決ロジックのユニットテスト
 */

import {
  DEFAULT_CANCEL_URL,
  FALLBACK_BASE_URL,
  FALLBACK_CALLBACK_URL_COOKIE_NAME,
  resolveBaseUrl,
  resolveCancelUrl,
  resolveCancelUrlFromRequest,
} from '../../../src/lib/signout';

const BASE_URL = 'https://auth.nagiyu.com';

function headersOf(values: Record<string, string>) {
  return { get: (name: string) => values[name] ?? null };
}

function cookiesOf(values: Record<string, string>) {
  return {
    get: (name: string) => (name in values ? { value: values[name] } : undefined),
  };
}

describe('resolveBaseUrl', () => {
  it('転送ヘッダーがあれば Host より優先する', () => {
    const headers = headersOf({
      'x-forwarded-host': 'auth.nagiyu.com',
      'x-forwarded-proto': 'https',
      host: 'internal.local:3000',
    });

    expect(resolveBaseUrl(headers, {})).toBe('https://auth.nagiyu.com');
  });

  it('転送ヘッダーが無ければ Host を使い、スキームは https を既定にする', () => {
    expect(resolveBaseUrl(headersOf({ host: 'auth.nagiyu.com' }), {})).toBe(
      'https://auth.nagiyu.com'
    );
  });

  it('x-forwarded-proto が http ならそれに従う', () => {
    const headers = headersOf({ host: 'localhost:3000', 'x-forwarded-proto': 'http' });

    expect(resolveBaseUrl(headers, {})).toBe('http://localhost:3000');
  });

  it('カンマ区切りの転送ヘッダーは最初の値を使う', () => {
    const headers = headersOf({
      'x-forwarded-host': 'auth.nagiyu.com, proxy.internal',
      'x-forwarded-proto': 'https, http',
    });

    expect(resolveBaseUrl(headers, {})).toBe('https://auth.nagiyu.com');
  });

  it('AUTH_URL があればヘッダーより優先し、その origin を返す', () => {
    const headers = headersOf({ host: 'xxxx.lambda-url.ap-northeast-1.on.aws' });

    expect(resolveBaseUrl(headers, { AUTH_URL: 'https://auth.nagiyu.com/api/auth' })).toBe(
      'https://auth.nagiyu.com'
    );
  });

  it('AUTH_URL が無ければ NEXTAUTH_URL の origin を使う', () => {
    const headers = headersOf({ host: 'internal.local' });

    expect(resolveBaseUrl(headers, { NEXTAUTH_URL: 'http://localhost:3000' })).toBe(
      'http://localhost:3000'
    );
  });

  it('AUTH_URL が NEXTAUTH_URL より優先される', () => {
    const env = { AUTH_URL: 'https://auth.nagiyu.com', NEXTAUTH_URL: 'http://localhost:3000' };

    expect(resolveBaseUrl(headersOf({}), env)).toBe('https://auth.nagiyu.com');
  });

  it('AUTH_URL が URL として不正ならヘッダーからの組み立てにフォールバックする', () => {
    const headers = headersOf({ host: 'auth.nagiyu.com' });

    expect(resolveBaseUrl(headers, { AUTH_URL: 'not a url' })).toBe('https://auth.nagiyu.com');
  });

  it('Host も転送ヘッダーも無ければフォールバックの Origin を返す', () => {
    expect(resolveBaseUrl(headersOf({}), {})).toBe(FALLBACK_BASE_URL);
  });
});

describe('resolveCancelUrl', () => {
  it('*.nagiyu.com の URL はそのまま戻り先にする', () => {
    expect(resolveCancelUrl('https://admin.nagiyu.com/', BASE_URL)).toBe(
      'https://admin.nagiyu.com/'
    );
  });

  it('同一オリジンの URL はそのまま戻り先にする', () => {
    expect(resolveCancelUrl('http://localhost:3000/dashboard', 'http://localhost:3000')).toBe(
      'http://localhost:3000/dashboard'
    );
  });

  it('値が無い場合は /dashboard にする', () => {
    expect(resolveCancelUrl(undefined, BASE_URL)).toBe(DEFAULT_CANCEL_URL);
    expect(resolveCancelUrl(null, BASE_URL)).toBe(DEFAULT_CANCEL_URL);
    expect(resolveCancelUrl('', BASE_URL)).toBe(DEFAULT_CANCEL_URL);
  });

  it('外部ドメインの URL は /dashboard にフォールバックする', () => {
    expect(resolveCancelUrl('https://evil.example.com/', BASE_URL)).toBe(DEFAULT_CANCEL_URL);
  });

  it('nagiyu.com を途中に含むだけのホスト名は拒否する', () => {
    expect(resolveCancelUrl('https://admin.nagiyu.com.evil.com/', BASE_URL)).toBe(
      DEFAULT_CANCEL_URL
    );
  });

  it('http / https 以外のスキームは拒否する', () => {
    expect(resolveCancelUrl('javascript:alert(1)', BASE_URL)).toBe(DEFAULT_CANCEL_URL);
  });

  it('URL として解釈できない値は拒否する', () => {
    expect(resolveCancelUrl('not a url', BASE_URL)).toBe(DEFAULT_CANCEL_URL);
  });
});

describe('resolveCancelUrlFromRequest', () => {
  const headers = headersOf({ host: 'auth.nagiyu.com' });

  it('指定された名前の Cookie を読み、検証して返す', () => {
    const cookies = cookiesOf({ '__Secure-authjs.callback-url.dev': 'https://admin.nagiyu.com/' });

    expect(
      resolveCancelUrlFromRequest(cookies, headers, '__Secure-authjs.callback-url.dev', {})
    ).toBe('https://admin.nagiyu.com/');
  });

  it('Cookie 名が未指定なら next-auth 既定の名前で読む', () => {
    const cookies = cookiesOf({
      [FALLBACK_CALLBACK_URL_COOKIE_NAME]: 'https://admin.nagiyu.com/',
    });

    expect(resolveCancelUrlFromRequest(cookies, headers, undefined, {})).toBe(
      'https://admin.nagiyu.com/'
    );
  });

  it('Cookie が無ければ /dashboard にする', () => {
    expect(resolveCancelUrlFromRequest(cookiesOf({}), headers, 'any-name', {})).toBe(
      DEFAULT_CANCEL_URL
    );
  });

  it('Cookie の値が不正なら /dashboard にする', () => {
    const cookies = cookiesOf({ 'any-name': 'https://evil.example.com/' });

    expect(resolveCancelUrlFromRequest(cookies, headers, 'any-name', {})).toBe(DEFAULT_CANCEL_URL);
  });

  it('AUTH_URL の origin を基準に同一オリジン判定する (Host が内部ホストでも成り立つ)', () => {
    const cookies = cookiesOf({ 'any-name': 'https://auth.example.org/dashboard' });
    const internalHeaders = headersOf({ host: 'xxxx.lambda-url.ap-northeast-1.on.aws' });

    expect(
      resolveCancelUrlFromRequest(cookies, internalHeaders, 'any-name', {
        AUTH_URL: 'https://auth.example.org',
      })
    ).toBe('https://auth.example.org/dashboard');
  });

  it('自サービスの Origin は Host から組み立てた値で同一オリジン判定する', () => {
    const cookies = cookiesOf({ 'any-name': 'https://auth.example.org/dashboard' });
    const ownHeaders = headersOf({ host: 'auth.example.org' });

    expect(resolveCancelUrlFromRequest(cookies, ownHeaders, 'any-name', {})).toBe(
      'https://auth.example.org/dashboard'
    );
  });
});
