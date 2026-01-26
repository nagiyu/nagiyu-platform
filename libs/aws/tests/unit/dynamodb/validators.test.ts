import {
  validateStringField,
  validateNumberField,
  validateEnumField,
  validateBooleanField,
  validateTimestampField,
} from '../../../src/dynamodb/validators.js';
import { InvalidEntityDataError } from '../../../src/dynamodb/errors.js';

describe('validators', () => {
  describe('validateStringField', () => {
    it('should validate a valid string', () => {
      const result = validateStringField('test', 'field');
      expect(result).toBe('test');
    });

    it('should throw error for non-string value', () => {
      expect(() => validateStringField(123, 'field')).toThrow(InvalidEntityDataError);
      expect(() => validateStringField(123, 'field')).toThrow(
        'フィールド "field" が文字列ではありません'
      );
    });

    it('should throw error for empty string by default', () => {
      expect(() => validateStringField('', 'field')).toThrow(InvalidEntityDataError);
      expect(() => validateStringField('', 'field')).toThrow('フィールド "field" が空です');
    });

    it('should allow empty string when allowEmpty is true', () => {
      const result = validateStringField('', 'field', { allowEmpty: true });
      expect(result).toBe('');
    });

    it('should validate minLength constraint', () => {
      expect(() => validateStringField('ab', 'field', { minLength: 3 })).toThrow(
        InvalidEntityDataError
      );
      expect(() => validateStringField('ab', 'field', { minLength: 3 })).toThrow(
        'フィールド "field" は3文字以上である必要があります'
      );
      expect(validateStringField('abc', 'field', { minLength: 3 })).toBe('abc');
    });

    it('should validate maxLength constraint', () => {
      expect(() => validateStringField('abcd', 'field', { maxLength: 3 })).toThrow(
        InvalidEntityDataError
      );
      expect(() => validateStringField('abcd', 'field', { maxLength: 3 })).toThrow(
        'フィールド "field" は3文字以下である必要があります'
      );
      expect(validateStringField('abc', 'field', { maxLength: 3 })).toBe('abc');
    });
  });

  describe('validateNumberField', () => {
    it('should validate a valid number', () => {
      const result = validateNumberField(42, 'field');
      expect(result).toBe(42);
    });

    it('should throw error for non-number value', () => {
      expect(() => validateNumberField('123', 'field')).toThrow(InvalidEntityDataError);
      expect(() => validateNumberField('123', 'field')).toThrow(
        'フィールド "field" が数値ではありません'
      );
    });

    it('should throw error for NaN', () => {
      expect(() => validateNumberField(NaN, 'field')).toThrow(InvalidEntityDataError);
      expect(() => validateNumberField(NaN, 'field')).toThrow(
        'フィールド "field" が不正な数値です (NaN)'
      );
    });

    it('should throw error for Infinity', () => {
      expect(() => validateNumberField(Infinity, 'field')).toThrow(InvalidEntityDataError);
      expect(() => validateNumberField(Infinity, 'field')).toThrow(
        'フィールド "field" が不正な数値です (Infinity)'
      );
      expect(() => validateNumberField(-Infinity, 'field')).toThrow(InvalidEntityDataError);
    });

    it('should validate integer constraint', () => {
      expect(() => validateNumberField(3.14, 'field', { integer: true })).toThrow(
        InvalidEntityDataError
      );
      expect(() => validateNumberField(3.14, 'field', { integer: true })).toThrow(
        'フィールド "field" は整数である必要があります'
      );
      expect(validateNumberField(42, 'field', { integer: true })).toBe(42);
    });

    it('should validate min constraint', () => {
      expect(() => validateNumberField(5, 'field', { min: 10 })).toThrow(InvalidEntityDataError);
      expect(() => validateNumberField(5, 'field', { min: 10 })).toThrow(
        'フィールド "field" は10以上である必要があります'
      );
      expect(validateNumberField(10, 'field', { min: 10 })).toBe(10);
    });

    it('should validate max constraint', () => {
      expect(() => validateNumberField(15, 'field', { max: 10 })).toThrow(InvalidEntityDataError);
      expect(() => validateNumberField(15, 'field', { max: 10 })).toThrow(
        'フィールド "field" は10以下である必要があります'
      );
      expect(validateNumberField(10, 'field', { max: 10 })).toBe(10);
    });
  });

  describe('validateEnumField', () => {
    const allowedValues = ['active', 'inactive', 'pending'] as const;

    it('should validate a valid enum value', () => {
      const result = validateEnumField('active', 'status', allowedValues);
      expect(result).toBe('active');
    });

    it('should throw error for invalid enum value', () => {
      expect(() => validateEnumField('invalid', 'status', allowedValues)).toThrow(
        InvalidEntityDataError
      );
      expect(() => validateEnumField('invalid', 'status', allowedValues)).toThrow(
        'フィールド "status" が不正です。許可される値: active, inactive, pending'
      );
    });

    it('should work with number enums', () => {
      const numValues = [1, 2, 3] as const;
      expect(validateEnumField(2, 'code', numValues)).toBe(2);
      expect(() => validateEnumField(4, 'code', numValues)).toThrow(InvalidEntityDataError);
    });
  });

  describe('validateBooleanField', () => {
    it('should validate a valid boolean true', () => {
      const result = validateBooleanField(true, 'field');
      expect(result).toBe(true);
    });

    it('should validate a valid boolean false', () => {
      const result = validateBooleanField(false, 'field');
      expect(result).toBe(false);
    });

    it('should throw error for non-boolean value', () => {
      expect(() => validateBooleanField('true', 'field')).toThrow(InvalidEntityDataError);
      expect(() => validateBooleanField('true', 'field')).toThrow(
        'フィールド "field" が真偽値ではありません'
      );
      expect(() => validateBooleanField(1, 'field')).toThrow(InvalidEntityDataError);
      expect(() => validateBooleanField(0, 'field')).toThrow(InvalidEntityDataError);
    });
  });

  describe('validateTimestampField', () => {
    const now = Date.now();
    const past = now - 10000;
    const future = now + 10000;

    it('should validate a valid timestamp', () => {
      const result = validateTimestampField(now, 'timestamp');
      expect(result).toBe(now);
    });

    it('should throw error for non-number value', () => {
      expect(() => validateTimestampField('123', 'timestamp')).toThrow(InvalidEntityDataError);
      expect(() => validateTimestampField('123', 'timestamp')).toThrow(
        'フィールド "timestamp" がタイムスタンプ（数値）ではありません'
      );
    });

    it('should throw error for non-integer timestamp', () => {
      expect(() => validateTimestampField(123.45, 'timestamp')).toThrow(InvalidEntityDataError);
      expect(() => validateTimestampField(123.45, 'timestamp')).toThrow(
        'フィールド "timestamp" が整数のタイムスタンプではありません'
      );
    });

    it('should throw error for negative timestamp', () => {
      expect(() => validateTimestampField(-123, 'timestamp')).toThrow(InvalidEntityDataError);
      expect(() => validateTimestampField(-123, 'timestamp')).toThrow(
        'フィールド "timestamp" が負の値のタイムスタンプです'
      );
    });

    it('should allow future timestamps by default', () => {
      const result = validateTimestampField(future, 'timestamp');
      expect(result).toBe(future);
    });

    it('should reject future timestamps when allowFuture is false', () => {
      expect(() => validateTimestampField(future, 'timestamp', { allowFuture: false })).toThrow(
        InvalidEntityDataError
      );
      expect(() => validateTimestampField(future, 'timestamp', { allowFuture: false })).toThrow(
        'フィールド "timestamp" が未来のタイムスタンプです'
      );
    });

    it('should allow past timestamps', () => {
      const result = validateTimestampField(past, 'timestamp', { allowFuture: false });
      expect(result).toBe(past);
    });
  });
});
