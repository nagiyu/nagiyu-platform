/**
 * resolveSigninErrorMessage のユニットテスト
 *
 * クエリの値は外部入力なので、Object 自身のプロパティ名でも既定の文になることを確認する。
 */

import {
  SIGNIN_ERROR_MESSAGES,
  resolveSigninErrorMessage,
} from '../../../src/lib/signin-error-message';

describe('resolveSigninErrorMessage', () => {
  it.each(['OAuthCallbackError', 'MissingCSRF'] as const)(
    '既知のコード %s は対応する文を返す',
    (code) => {
      expect(resolveSigninErrorMessage(code)).toBe(SIGNIN_ERROR_MESSAGES[code]);
    }
  );

  it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf'])(
    'Object のプロパティ名 %s は既定の文を返す',
    (code) => {
      expect(resolveSigninErrorMessage(code)).toBe(SIGNIN_ERROR_MESSAGES.Default);
    }
  );

  it('未知の値と Default という名前の値は既定の文を返す', () => {
    expect(resolveSigninErrorMessage('Unknown')).toBe(SIGNIN_ERROR_MESSAGES.Default);
    expect(resolveSigninErrorMessage('Default')).toBe(SIGNIN_ERROR_MESSAGES.Default);
  });

  it('大文字小文字が違う値は既知として扱わない', () => {
    expect(resolveSigninErrorMessage('missingcsrf')).toBe(SIGNIN_ERROR_MESSAGES.Default);
  });

  it.each([undefined, null, ''])('%j は表示しない (null)', (value) => {
    expect(resolveSigninErrorMessage(value)).toBeNull();
  });
});
