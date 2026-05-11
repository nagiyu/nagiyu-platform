import { describe, expect, it } from '@jest/globals';
import { extractErrorMessage } from '../../../src/api/error-utils.js';

describe('extractErrorMessage', () => {
  it('errorData が null のときは defaultMessage を返す', () => {
    expect(extractErrorMessage(null, 'default')).toBe('default');
  });

  it('errorData が undefined のときは defaultMessage を返す', () => {
    expect(extractErrorMessage(undefined, 'default')).toBe('default');
  });

  it('errorData が string のときは defaultMessage を返す', () => {
    expect(extractErrorMessage('error string', 'default')).toBe('default');
  });

  it('errorData.message が string のときはそれを返す', () => {
    expect(extractErrorMessage({ message: 'specific error' }, 'default')).toBe('specific error');
  });

  it('errorData.error.message が string のときはそれを返す', () => {
    expect(extractErrorMessage({ error: { message: 'nested error' } }, 'default')).toBe(
      'nested error'
    );
  });

  it('message が優先される (error.message より先)', () => {
    expect(
      extractErrorMessage({ message: 'top-level', error: { message: 'nested' } }, 'default')
    ).toBe('top-level');
  });

  it('message が string でないときは error.message にフォールバック', () => {
    expect(extractErrorMessage({ message: 123, error: { message: 'nested' } }, 'default')).toBe(
      'nested'
    );
  });

  it('どちらも文字列で取れない場合は defaultMessage を返す', () => {
    expect(extractErrorMessage({ message: 123, error: { message: 456 } }, 'default')).toBe(
      'default'
    );
  });
});
