import { InvalidEntityDataError } from '../../../src/dynamodb/errors.js';
import { REMOVE_ATTRIBUTE } from '../../../src/dynamodb/helpers.js';
import {
  PATCH_VALUE_ERROR_MESSAGES,
  immutablePatchValue,
  optionalPatchValue,
  requiredPatchValue,
} from '../../../src/dynamodb/mapper/patch-values.js';

describe('requiredPatchValue', () => {
  it('値はそのまま返す (falsy でも変えない)', () => {
    expect(requiredPatchValue('題名', 'Title')).toBe('題名');
    expect(requiredPatchValue(0, 'Count')).toBe(0);
    expect(requiredPatchValue('', 'Title')).toBe('');
    expect(requiredPatchValue(false, 'Flag')).toBe(false);
  });

  it('undefined (変更なし) はそのまま返す', () => {
    expect(requiredPatchValue(undefined, 'Title')).toBeUndefined();
  });

  it('null は InvalidEntityDataError で、項目名を含む', () => {
    expect(() => requiredPatchValue(null, 'Title')).toThrow(InvalidEntityDataError);
    expect(() => requiredPatchValue(null, 'Title')).toThrow(
      `${PATCH_VALUE_ERROR_MESSAGES.REQUIRED_ATTRIBUTE_REMOVE}: Title`
    );
  });
});

describe('optionalPatchValue', () => {
  it('null は REMOVE_ATTRIBUTE にする', () => {
    expect(optionalPatchValue(null)).toBe(REMOVE_ATTRIBUTE);
  });

  it('値と undefined はそのまま返す', () => {
    expect(optionalPatchValue('メモ')).toBe('メモ');
    expect(optionalPatchValue(0)).toBe(0);
    expect(optionalPatchValue(undefined)).toBeUndefined();
  });
});

describe('immutablePatchValue', () => {
  it('undefined なら undefined を返す', () => {
    expect(immutablePatchValue(undefined, 'CreatedAt')).toBeUndefined();
  });

  it('undefined 以外 (null・falsy を含む) は InvalidEntityDataError で、項目名を含む', () => {
    for (const value of [1, 'x', null, 0, '', false]) {
      expect(() => immutablePatchValue(value, 'CreatedAt')).toThrow(InvalidEntityDataError);
    }
    expect(() => immutablePatchValue(1, 'CreatedAt')).toThrow(
      `${PATCH_VALUE_ERROR_MESSAGES.IMMUTABLE_ATTRIBUTE_UPDATE}: CreatedAt`
    );
  });
});
