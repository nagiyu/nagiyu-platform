import { isNonEmptyString } from '@/lib/api/validation';

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
});
