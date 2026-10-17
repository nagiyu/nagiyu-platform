/**
 * NiconicoCredential Mapper のテスト
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { InvalidEntityDataError } from '@nagiyu/aws';
import { NiconicoCredentialMapper } from '../../../src/mappers/niconico-credential.mapper.js';
import {
  NICONICO_CREDENTIAL_SK,
  type NiconicoCredentialEntity,
} from '../../../src/entities/niconico-credential.entity.js';

const ACQUIRED_AT = 1700000000000;
const EXPIRES_AT = 1702592000000;
const KEY = { userId: 'user-1' };
const BLOB = JSON.stringify({ ciphertext: 'c', iv: 'i', authTag: 'a' });

function buildEntity(overrides: Partial<NiconicoCredentialEntity> = {}): NiconicoCredentialEntity {
  return {
    userId: 'user-1',
    encryptedUserSession: BLOB,
    acquiredAt: ACQUIRED_AT,
    estimatedExpiresAt: EXPIRES_AT,
    ...overrides,
  };
}

function buildItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    PK: 'USER#user-1',
    SK: NICONICO_CREDENTIAL_SK,
    Type: 'NICONICO_CREDENTIAL',
    UserID: 'user-1',
    EncryptedUserSession: BLOB,
    AcquiredAt: ACQUIRED_AT,
    EstimatedExpiresAt: EXPIRES_AT,
    CreatedAt: ACQUIRED_AT,
    UpdatedAt: ACQUIRED_AT,
    ...overrides,
  };
}

describe('NiconicoCredentialMapper', () => {
  let mapper: NiconicoCredentialMapper;

  beforeEach(() => {
    mapper = new NiconicoCredentialMapper();
  });

  it('entityType は NICONICO_CREDENTIAL になる', () => {
    expect(mapper.entityType).toBe('NICONICO_CREDENTIAL');
  });

  it('新属性名に対する旧属性名 (camelCase) を宣言する', () => {
    expect(mapper.legacyAttributeNames).toEqual({
      UserID: ['userId'],
      EncryptedUserSession: ['encryptedUserSession'],
      AcquiredAt: ['acquiredAt'],
      EstimatedExpiresAt: ['estimatedExpiresAt'],
    });
  });

  describe('buildKeys / getKey', () => {
    it('ビジネスキーから PK/SK を構築できる', () => {
      expect(mapper.buildKeys(KEY)).toEqual({ PK: 'USER#user-1', SK: 'CREDENTIAL#niconico' });
    });

    it('PK が先頭のキー属性になる', () => {
      expect(Object.keys(mapper.buildKeys(KEY))).toEqual(['PK', 'SK']);
    });

    it('Entity からビジネスキーを取り出せる', () => {
      expect(mapper.getKey(buildEntity())).toEqual(KEY);
    });
  });

  describe('toItem', () => {
    it('Entity を PascalCase の属性名の Item に変換し、CreatedAt に acquiredAt を書く', () => {
      const item = mapper.toItem(buildEntity());

      expect(item).toEqual({
        PK: 'USER#user-1',
        SK: NICONICO_CREDENTIAL_SK,
        Type: 'NICONICO_CREDENTIAL',
        UserID: 'user-1',
        EncryptedUserSession: BLOB,
        AcquiredAt: ACQUIRED_AT,
        EstimatedExpiresAt: EXPIRES_AT,
        CreatedAt: ACQUIRED_AT,
      });
    });

    it('旧属性名は書かない', () => {
      const item = mapper.toItem(buildEntity());

      for (const legacyName of [
        'userId',
        'encryptedUserSession',
        'acquiredAt',
        'estimatedExpiresAt',
      ]) {
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

    it('旧属性名 (camelCase) の Item も読める', () => {
      const entity = mapper.toEntity({
        PK: 'USER#user-1',
        SK: NICONICO_CREDENTIAL_SK,
        Type: 'NICONICO_CREDENTIAL',
        userId: 'user-1',
        encryptedUserSession: BLOB,
        acquiredAt: ACQUIRED_AT,
        estimatedExpiresAt: EXPIRES_AT,
        CreatedAt: ACQUIRED_AT,
        UpdatedAt: ACQUIRED_AT,
      });

      expect(entity).toEqual(buildEntity());
    });

    it('新旧の属性名が併存するときは新名を優先する', () => {
      const entity = mapper.toEntity(
        buildItem({
          EncryptedUserSession: 'new-blob',
          encryptedUserSession: 'old-blob',
          AcquiredAt: ACQUIRED_AT + 1,
          acquiredAt: ACQUIRED_AT,
        })
      );

      expect(entity.encryptedUserSession).toBe('new-blob');
      expect(entity.acquiredAt).toBe(ACQUIRED_AT + 1);
    });

    it.each(['UserID', 'EncryptedUserSession', 'AcquiredAt', 'EstimatedExpiresAt'])(
      '必須属性 %s が欠けていると InvalidEntityDataError になる',
      (name) => {
        const item = buildItem();
        delete item[name];

        expect(() => mapper.toEntity(item)).toThrow(InvalidEntityDataError);
      }
    );

    it('不正なタイムスタンプは InvalidEntityDataError になる', () => {
      expect(() => mapper.toEntity(buildItem({ AcquiredAt: 'invalid' }))).toThrow(
        InvalidEntityDataError
      );
    });
  });

  describe('toUpdateAttributes', () => {
    it('変更された項目だけを保存用の属性名で返す', () => {
      const attributes = mapper.toUpdateAttributes({ estimatedExpiresAt: EXPIRES_AT + 1 });

      expect(attributes.EstimatedExpiresAt).toBe(EXPIRES_AT + 1);
      expect(attributes.EncryptedUserSession).toBeUndefined();
      expect(attributes.AcquiredAt).toBeUndefined();
    });

    it.each(['encryptedUserSession', 'acquiredAt', 'estimatedExpiresAt'] as const)(
      '必須項目 %s に null を渡すと InvalidEntityDataError になる',
      (field) => {
        expect(() => mapper.toUpdateAttributes({ [field]: null })).toThrow(InvalidEntityDataError);
      }
    );

    it('変更できない項目 userId を含めると InvalidEntityDataError になる', () => {
      expect(() => mapper.toUpdateAttributes({ userId: 'user-2' })).toThrow(InvalidEntityDataError);
    });
  });
});
