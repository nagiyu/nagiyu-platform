/**
 * resolveAuthErrorMessage のユニットテスト
 *
 * クエリの値は外部入力なので、Object 自身のプロパティ名でも既定メッセージになることを確認する。
 */

import { AUTH_ERROR_MESSAGES, resolveAuthErrorMessage } from '../../../src/lib/auth-error-message';

describe('resolveAuthErrorMessage', () => {
  it.each(['Configuration', 'AccessDenied', 'Verification', 'Default'] as const)(
    '既知のコード %s は対応するメッセージを返す',
    (code) => {
      expect(resolveAuthErrorMessage(code)).toBe(AUTH_ERROR_MESSAGES[code]);
    }
  );

  it('Configuration は設定不備のメッセージを返す', () => {
    expect(resolveAuthErrorMessage('Configuration')).toContain('サーバー設定');
  });

  it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf'])(
    'Object のプロパティ名 %s は既定のメッセージを返す',
    (code) => {
      const message = resolveAuthErrorMessage(code);
      expect(typeof message).toBe('string');
      expect(message).toBe(AUTH_ERROR_MESSAGES.Default);
    }
  );

  it('未知の値は既定のメッセージを返す', () => {
    expect(resolveAuthErrorMessage('Unknown')).toBe(AUTH_ERROR_MESSAGES.Default);
  });

  it('大文字小文字が違う値は既知として扱わない', () => {
    expect(resolveAuthErrorMessage('accessdenied')).toBe(AUTH_ERROR_MESSAGES.Default);
  });

  it('null は既定のメッセージを返す', () => {
    expect(resolveAuthErrorMessage(null)).toBe(AUTH_ERROR_MESSAGES.Default);
  });

  it('undefined と空文字は既定のメッセージを返す', () => {
    expect(resolveAuthErrorMessage(undefined)).toBe(AUTH_ERROR_MESSAGES.Default);
    expect(resolveAuthErrorMessage('')).toBe(AUTH_ERROR_MESSAGES.Default);
  });
});
