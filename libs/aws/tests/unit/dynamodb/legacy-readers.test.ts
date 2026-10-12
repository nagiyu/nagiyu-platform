import {
  readAttribute,
  readTimestamp,
  readOptionalTimestamp,
  toTtlSeconds,
  TTL_ATTRIBUTE_NAME,
} from '../../../src/dynamodb/validators.js';
import { InvalidEntityDataError, OptimisticLockError } from '../../../src/dynamodb/errors.js';

describe('readAttribute', () => {
  it('新名を優先する', () => {
    expect(readAttribute({ Name: '新', name: '旧' }, 'Name', ['name'])).toBe('新');
  });

  it('新名がなければ旧名を順に探す', () => {
    expect(readAttribute({ old2: 'b' }, 'Name', ['old1', 'old2'])).toBe('b');
    expect(readAttribute({ old1: 'a', old2: 'b' }, 'Name', ['old1', 'old2'])).toBe('a');
  });

  it('どこにもなければ undefined', () => {
    expect(readAttribute({}, 'Name', ['name'])).toBeUndefined();
    expect(readAttribute({}, 'Name')).toBeUndefined();
  });
});

describe('readTimestamp', () => {
  it('ミリ秒はそのまま返す', () => {
    expect(readTimestamp({ At: 1_700_000_000_000 }, 'At')).toBe(1_700_000_000_000);
  });

  it('1e11 未満はエポック秒とみなしてミリ秒にする', () => {
    expect(readTimestamp({ At: 1_700_000_000 }, 'At')).toBe(1_700_000_000_000);
    expect(readTimestamp({ At: 0 }, 'At')).toBe(0);
  });

  it('1e11 ちょうどはミリ秒として扱う', () => {
    expect(readTimestamp({ At: 1e11 }, 'At')).toBe(1e11);
  });

  it('ISO 文字列をミリ秒にする', () => {
    expect(readTimestamp({ At: '2020-01-01T00:00:00.000Z' }, 'At')).toBe(
      Date.parse('2020-01-01T00:00:00.000Z')
    );
  });

  it('旧名から読める', () => {
    expect(readTimestamp({ updatedAt: 1_700_000_000 }, 'UpdatedAt', ['updatedAt'])).toBe(
      1_700_000_000_000
    );
  });

  it('不正値・欠落・負数は InvalidEntityDataError', () => {
    expect(() => readTimestamp({}, 'At')).toThrow(InvalidEntityDataError);
    expect(() => readTimestamp({ At: 'x' }, 'At')).toThrow(InvalidEntityDataError);
    expect(() => readTimestamp({ At: true }, 'At')).toThrow(InvalidEntityDataError);
    expect(() => readTimestamp({ At: -1 }, 'At')).toThrow(InvalidEntityDataError);
    expect(() => readTimestamp({ At: NaN }, 'At')).toThrow(InvalidEntityDataError);
  });

  it('allowFuture: false なら未来を拒否する', () => {
    const future = Date.now() + 100_000;
    expect(readTimestamp({ At: future }, 'At')).toBe(future);
    expect(() => readTimestamp({ At: future }, 'At', [], { allowFuture: false })).toThrow(
      InvalidEntityDataError
    );
  });
});

describe('readOptionalTimestamp', () => {
  it('なければ undefined、あれば変換する', () => {
    expect(readOptionalTimestamp({}, 'At')).toBeUndefined();
    expect(readOptionalTimestamp({ at: 1_700_000_000 }, 'At', ['at'])).toBe(1_700_000_000_000);
  });

  it('あって不正なら InvalidEntityDataError', () => {
    expect(() => readOptionalTimestamp({ At: 'x' }, 'At')).toThrow(InvalidEntityDataError);
  });
});

describe('TTL', () => {
  it('属性名は TTL、値はエポック秒 (切り捨て)', () => {
    expect(TTL_ATTRIBUTE_NAME).toBe('TTL');
    expect(toTtlSeconds(1_700_000_000_999)).toBe(1_700_000_000);
  });
});

describe('OptimisticLockError', () => {
  it('RepositoryError 派生で種別とキーをメッセージに含む', () => {
    const error = new OptimisticLockError('Note', 'n1');
    expect(error.name).toBe('OptimisticLockError');
    expect(error.message).toContain('Note=n1');
  });
});
