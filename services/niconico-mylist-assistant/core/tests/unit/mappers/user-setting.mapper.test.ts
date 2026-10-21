/**
 * UserSetting Mapper のテスト
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { InvalidEntityDataError, REMOVE_ATTRIBUTE } from '@nagiyu/aws';
import { UserSettingMapper } from '../../../src/mappers/user-setting.mapper.js';
import type { UserSettingEntity } from '../../../src/entities/user-setting.entity.js';

const TIMESTAMP = 1704067200000;
const KEY = { userId: 'user123', videoId: 'sm12345' };

function buildEntity(overrides: Partial<UserSettingEntity> = {}): UserSettingEntity {
  return {
    userId: 'user123',
    videoId: 'sm12345',
    isFavorite: true,
    isSkip: false,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

function buildItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    PK: 'USER#user123',
    SK: 'VIDEO#sm12345',
    Type: 'USER_SETTING',
    UserID: 'user123',
    VideoID: 'sm12345',
    IsFavorite: true,
    IsSkip: false,
    CreatedAt: TIMESTAMP,
    UpdatedAt: TIMESTAMP,
    ...overrides,
  };
}

describe('UserSettingMapper', () => {
  let mapper: UserSettingMapper;

  beforeEach(() => {
    mapper = new UserSettingMapper();
  });

  it('entityType は USER_SETTING になる', () => {
    expect(mapper.entityType).toBe('USER_SETTING');
  });

  it('新属性名に対する旧属性名 (camelCase) を宣言する', () => {
    expect(mapper.legacyAttributeNames).toEqual({
      UserID: ['userId'],
      VideoID: ['videoId'],
      IsFavorite: ['isFavorite'],
      IsSkip: ['isSkip'],
      Memo: ['memo'],
    });
  });

  describe('buildKeys / getKey', () => {
    it('ビジネスキーから PK/SK を構築できる', () => {
      expect(mapper.buildKeys(KEY)).toEqual({ PK: 'USER#user123', SK: 'VIDEO#sm12345' });
    });

    it('PK が先頭のキー属性になる', () => {
      expect(Object.keys(mapper.buildKeys(KEY))).toEqual(['PK', 'SK']);
    });

    it('Entity からビジネスキーを取り出せる', () => {
      expect(mapper.getKey(buildEntity())).toEqual(KEY);
    });
  });

  describe('toItem', () => {
    it('Entity を PascalCase の属性名の Item に変換する', () => {
      expect(mapper.toItem(buildEntity())).toEqual(buildItem());
    });

    it('memo を Memo で保存する', () => {
      const item = mapper.toItem(buildEntity({ memo: 'メモ' }));

      expect(item.Memo).toBe('メモ');
      expect(item).not.toHaveProperty('memo');
    });

    it('memo がなければ Memo を書かない', () => {
      expect(mapper.toItem(buildEntity())).not.toHaveProperty('Memo');
    });

    it('旧属性名は書かない', () => {
      const item = mapper.toItem(buildEntity({ memo: 'メモ' }));

      for (const legacyName of ['userId', 'videoId', 'isFavorite', 'isSkip', 'memo']) {
        expect(item).not.toHaveProperty(legacyName);
      }
    });

    it('toItem のキー属性は buildKeys の結果と一致する', () => {
      const item = mapper.toItem(buildEntity());

      for (const [name, value] of Object.entries(mapper.buildKeys(KEY))) {
        expect(item[name]).toBe(value);
      }
    });
  });

  describe('toEntity', () => {
    it('新属性名の Item を Entity に変換できる', () => {
      expect(mapper.toEntity(buildItem())).toEqual(buildEntity());
    });

    it('Memo を読める (空文字も許す)', () => {
      expect(mapper.toEntity(buildItem({ Memo: 'メモ' })).memo).toBe('メモ');
      expect(mapper.toEntity(buildItem({ Memo: '' })).memo).toBe('');
    });

    it('旧属性名 (camelCase) の Item も読める', () => {
      const entity = mapper.toEntity({
        PK: 'USER#user123',
        SK: 'VIDEO#sm12345',
        Type: 'USER_SETTING',
        userId: 'user123',
        videoId: 'sm12345',
        isFavorite: true,
        isSkip: true,
        memo: '旧メモ',
        CreatedAt: TIMESTAMP,
        UpdatedAt: TIMESTAMP,
      });

      expect(entity).toEqual(buildEntity({ isSkip: true, memo: '旧メモ' }));
    });

    it('新旧の属性名が併存するときは新名を優先する', () => {
      const entity = mapper.toEntity(
        buildItem({ IsFavorite: false, isFavorite: true, Memo: '新', memo: '旧' })
      );

      expect(entity.isFavorite).toBe(false);
      expect(entity.memo).toBe('新');
    });

    it.each(['UserID', 'VideoID', 'IsFavorite', 'IsSkip', 'CreatedAt', 'UpdatedAt'])(
      '必須属性 %s が欠けていると InvalidEntityDataError になる',
      (name) => {
        const item = buildItem();
        delete item[name];

        expect(() => mapper.toEntity(item)).toThrow(InvalidEntityDataError);
      }
    );

    it('真偽値でない IsFavorite は InvalidEntityDataError になる', () => {
      expect(() => mapper.toEntity(buildItem({ IsFavorite: 'true' }))).toThrow(
        InvalidEntityDataError
      );
    });
  });

  describe('toUpdateAttributes', () => {
    it('変更された項目だけを保存用の属性名で返す', () => {
      const attributes = mapper.toUpdateAttributes({ isFavorite: false, memo: '新メモ' });

      expect(attributes.IsFavorite).toBe(false);
      expect(attributes.Memo).toBe('新メモ');
      expect(attributes.IsSkip).toBeUndefined();
      expect(attributes).not.toHaveProperty('isFavorite');
    });

    it('任意項目 memo は null で属性の削除になる', () => {
      expect(mapper.toUpdateAttributes({ memo: null }).Memo).toBe(REMOVE_ATTRIBUTE);
    });

    it.each(['isFavorite', 'isSkip'] as const)(
      '必須項目 %s に null を渡すと InvalidEntityDataError になる',
      (field) => {
        expect(() => mapper.toUpdateAttributes({ [field]: null })).toThrow(InvalidEntityDataError);
      }
    );

    it.each([
      ['userId', 'user123'],
      ['videoId', 'sm12345'],
      ['createdAt', 1],
    ] as const)('変更できない項目 %s を含めると InvalidEntityDataError になる', (field, value) => {
      expect(() => mapper.toUpdateAttributes({ [field]: value })).toThrow(InvalidEntityDataError);
    });
  });
});
