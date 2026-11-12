import { InvalidEntityDataError } from '@nagiyu/aws';
import { DailySaltMapper } from '../../../src/mappers/daily-salt.mapper.js';

describe('DailySaltMapper', () => {
  const mapper = new DailySaltMapper();
  const keys = { PK: 'USAGE_SALT#20261105', SK: 'USAGE_SALT#20261105' };

  it('日付からキーを組み立て、Entity からキーを取り出す', () => {
    expect(mapper.buildKeys({ day: '20261105' })).toEqual(keys);
    expect(mapper.getKey({ day: '20261105', salt: 's', ttlSec: 1 })).toEqual({ day: '20261105' });
  });

  it('Item に Type・Salt・TTL (秒) と、あれば CreatedAt を書く', () => {
    expect(mapper.toItem({ day: '20261105', salt: 's', ttlSec: 99 })).toEqual({
      ...keys,
      Type: 'USAGE_SALT',
      Salt: 's',
      TTL: 99,
    });
    expect(mapper.toItem({ day: '20261105', salt: 's', ttlSec: 99, createdAt: 5 })).toMatchObject({
      CreatedAt: 5,
    });
  });

  it('タイムスタンプの有無にかかわらず Item を Entity に戻せる', () => {
    const base = { ...keys, Type: 'USAGE_SALT', Salt: 's', TTL: 99 };

    expect(mapper.toEntity(base)).toEqual({ day: '20261105', salt: 's', ttlSec: 99 });
    expect(
      mapper.toEntity({ ...base, CreatedAt: 1700000000000, UpdatedAt: 1700000000000 })
    ).toEqual({ day: '20261105', salt: 's', ttlSec: 99, createdAt: 1700000000000 });
  });

  it('Salt が文字列でない、または PK が塩のものでないと検証エラーにする', () => {
    expect(() => mapper.toEntity({ ...keys, Salt: 1, TTL: 99 })).toThrow(InvalidEntityDataError);
    expect(() => mapper.toEntity({ ...keys, TTL: 99 })).toThrow(InvalidEntityDataError);
    expect(() => mapper.toEntity({ PK: 'OTHER#1', SK: 'OTHER#1', Salt: 's', TTL: 99 })).toThrow(
      InvalidEntityDataError
    );
    expect(() => mapper.toEntity({ Salt: 's', TTL: 99 })).toThrow(InvalidEntityDataError);
  });

  it('作成後に変えない項目の更新は拒否する', () => {
    expect(mapper.toUpdateAttributes({})).toEqual({
      Salt: undefined,
      TTL: undefined,
      CreatedAt: undefined,
    });
    expect(() => mapper.toUpdateAttributes({ salt: 'x' })).toThrow(InvalidEntityDataError);
  });
});
