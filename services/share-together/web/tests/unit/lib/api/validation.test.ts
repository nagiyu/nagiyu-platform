import { isNonEmptyString, isNotFoundError, isValidationError } from '@/lib/api/validation';

describe('lib/api/validation', () => {
  describe('isNonEmptyString', () => {
    it.each([
      ['abc', true],
      [' a ', true],
      ['', false],
      ['   ', false],
      ['\n\t', false],
      [undefined, false],
      [null, false],
      [1, false],
    ])('%p は %p', (value, expected) => {
      expect(isNonEmptyString(value)).toBe(expected);
    });
  });

  describe('isValidationError / isNotFoundError', () => {
    const messages = new Set(['対象メッセージ']);

    it('集合に含まれるメッセージの Error なら true', () => {
      expect(isValidationError(new Error('対象メッセージ'), messages)).toBe(true);
      expect(isNotFoundError(new Error('対象メッセージ'), messages)).toBe(true);
    });

    it('集合に含まれないメッセージや Error 以外なら false', () => {
      expect(isValidationError(new Error('別'), messages)).toBe(false);
      expect(isNotFoundError('対象メッセージ', messages)).toBe(false);
    });
  });
});
