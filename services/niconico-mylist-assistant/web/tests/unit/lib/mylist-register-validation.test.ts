import { validateMaxCountInput } from '../../../src/lib/mylist-register-validation';
import { ERROR_MESSAGES } from '../../../src/lib/constants/errors';

describe('validateMaxCountInput', () => {
  it.each([
    ['1', 1],
    ['50', 50],
    ['100', 100],
    [' 30 ', 30],
  ])('「%s」は有効な整数として受け付ける', (input, expected) => {
    expect(validateMaxCountInput(input)).toEqual({ valid: true, value: expected });
  });

  it.each(['', '  ', '1.5', 'abc', '0.5'])('「%s」は整数でないとして拒否する', (input) => {
    expect(validateMaxCountInput(input)).toEqual({
      valid: false,
      message: ERROR_MESSAGES.MYLIST_REGISTER_MAX_COUNT_MUST_BE_INTEGER,
    });
  });

  it.each(['0', '101', '-1', '1000'])('「%s」は範囲外として拒否する', (input) => {
    expect(validateMaxCountInput(input)).toEqual({
      valid: false,
      message: ERROR_MESSAGES.MYLIST_REGISTER_MAX_COUNT_INVALID_RANGE,
    });
  });
});
