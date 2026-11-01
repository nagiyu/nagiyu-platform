/**
 * buildErrorContext の単体テスト
 */

import { buildErrorContext } from '../../../src/error-event/error-context.js';

describe('buildErrorContext', () => {
  it('Error から name / message / stack を組み立てる', () => {
    const error = new Error('失敗しました');

    expect(buildErrorContext(error)).toEqual({
      errorName: 'Error',
      errorMessage: '失敗しました',
      errorStack: error.stack,
    });
  });

  it('Error のサブクラスは name を引き継ぐ', () => {
    class CustomError extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'CustomError';
      }
    }
    const error = new CustomError('独自エラー');

    const context = buildErrorContext(error);

    expect(context.errorName).toBe('CustomError');
    expect(context.errorMessage).toBe('独自エラー');
    expect(context.errorStack).toBe(error.stack);
  });

  it('stack が無い Error では errorStack を含めない', () => {
    const error = new Error('stack なし');
    error.stack = undefined;

    expect(buildErrorContext(error)).not.toHaveProperty('errorStack');
  });

  it.each([
    ['文字列', 'oops', 'string', 'oops'],
    ['数値', 42, 'number', '42'],
    ['オブジェクト', { code: 1 }, 'object', '[object Object]'],
    ['undefined', undefined, 'undefined', 'undefined'],
    ['null', null, 'object', 'null'],
  ])('%s は typeof と文字列化で組み立て、errorStack を含めない', (_label, error, name, message) => {
    const context = buildErrorContext(error);

    expect(context).toEqual({ errorName: name, errorMessage: message });
    expect(context).not.toHaveProperty('errorStack');
  });
});
