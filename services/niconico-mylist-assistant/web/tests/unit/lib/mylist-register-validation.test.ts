import {
  validateMaxCountInput,
  validateMylistName,
} from '../../../src/lib/mylist-register-validation';
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

describe('validateMylistName', () => {
  it('前後の空白を除いた名前を返す', () => {
    expect(validateMylistName('  テスト  ')).toEqual({ valid: true, value: 'テスト' });
  });

  it('50 文字ちょうどは受け付け、51 文字は拒否する', () => {
    expect(validateMylistName('あ'.repeat(50))).toEqual({ valid: true, value: 'あ'.repeat(50) });
    expect(validateMylistName('あ'.repeat(51))).toEqual({
      valid: false,
      message: ERROR_MESSAGES.MYLIST_NAME_TOO_LONG,
    });
  });

  it('文字数はコードポイント単位で数える', () => {
    // 絵文字は UTF-16 では 2 要素だが 1 文字として数える
    expect(validateMylistName('😀'.repeat(50)).valid).toBe(true);
    expect(validateMylistName('😀'.repeat(51)).valid).toBe(false);
  });

  it('空白だけなら既定の必須メッセージで拒否する', () => {
    expect(validateMylistName(' \u3000 ')).toEqual({
      valid: false,
      message: ERROR_MESSAGES.MYLIST_NAME_REQUIRED,
    });
  });

  it('空だった場合のメッセージを差し替えられる', () => {
    expect(validateMylistName('', ERROR_MESSAGES.MYLIST_NAME_INPUT_REQUIRED)).toEqual({
      valid: false,
      message: ERROR_MESSAGES.MYLIST_NAME_INPUT_REQUIRED,
    });
  });
});
