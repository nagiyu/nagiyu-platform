/**
 * NiconicoCredentialMapper のユニットテスト
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { NiconicoCredentialMapper } from '../../../src/mappers/niconico-credential.mapper.js';
import type { NiconicoCredentialEntity } from '../../../src/entities/niconico-credential.entity.js';
import { NICONICO_CREDENTIAL_SK } from '../../../src/entities/niconico-credential.entity.js';

describe('NiconicoCredentialMapper', () => {
  let mapper: NiconicoCredentialMapper;

  const sampleEntity: NiconicoCredentialEntity = {
    userId: 'user123',
    encryptedUserSession: JSON.stringify({
      ciphertext: 'dummyCiphertext',
      iv: 'dummyIv',
      authTag: 'dummyAuthTag',
    }),
    acquiredAt: 1700000000000,
    estimatedExpiresAt: 1702592000000, // +30日
  };

  beforeEach(() => {
    mapper = new NiconicoCredentialMapper();
  });

  describe('toItem', () => {
    it('Entity を DynamoDB Item に変換できる', () => {
      const item = mapper.toItem(sampleEntity);

      expect(item.PK).toBe('USER#user123');
      expect(item.SK).toBe(NICONICO_CREDENTIAL_SK);
      expect(item.Type).toBe('NICONICO_CREDENTIAL');
      expect(item.userId).toBe('user123');
      expect(item.encryptedUserSession).toBe(sampleEntity.encryptedUserSession);
      expect(item.acquiredAt).toBe(1700000000000);
      expect(item.estimatedExpiresAt).toBe(1702592000000);
    });

    it('PK が USER#{userId} 形式になる', () => {
      const item = mapper.toItem(sampleEntity);
      expect(item.PK).toBe('USER#user123');
    });

    it('SK が CREDENTIAL#niconico 固定になる', () => {
      const item = mapper.toItem(sampleEntity);
      expect(item.SK).toBe('CREDENTIAL#niconico');
    });
  });

  describe('toEntity', () => {
    it('DynamoDB Item を Entity に変換できる', () => {
      const item = {
        PK: 'USER#user123',
        SK: NICONICO_CREDENTIAL_SK,
        Type: 'NICONICO_CREDENTIAL',
        userId: 'user123',
        encryptedUserSession: sampleEntity.encryptedUserSession,
        acquiredAt: 1700000000000,
        estimatedExpiresAt: 1702592000000,
      };

      const entity = mapper.toEntity(item);

      expect(entity.userId).toBe('user123');
      expect(entity.encryptedUserSession).toBe(sampleEntity.encryptedUserSession);
      expect(entity.acquiredAt).toBe(1700000000000);
      expect(entity.estimatedExpiresAt).toBe(1702592000000);
    });

    it('userId が欠けている場合にエラーを投げる', () => {
      const item = {
        PK: 'USER#user123',
        SK: NICONICO_CREDENTIAL_SK,
        Type: 'NICONICO_CREDENTIAL',
        encryptedUserSession: sampleEntity.encryptedUserSession,
        acquiredAt: 1700000000000,
        estimatedExpiresAt: 1702592000000,
      };

      expect(() => mapper.toEntity(item)).toThrow();
    });

    it('encryptedUserSession が欠けている場合にエラーを投げる', () => {
      const item = {
        PK: 'USER#user123',
        SK: NICONICO_CREDENTIAL_SK,
        Type: 'NICONICO_CREDENTIAL',
        userId: 'user123',
        acquiredAt: 1700000000000,
        estimatedExpiresAt: 1702592000000,
      };

      expect(() => mapper.toEntity(item)).toThrow();
    });

    it('acquiredAt が欠けている場合にエラーを投げる', () => {
      const item = {
        PK: 'USER#user123',
        SK: NICONICO_CREDENTIAL_SK,
        Type: 'NICONICO_CREDENTIAL',
        userId: 'user123',
        encryptedUserSession: sampleEntity.encryptedUserSession,
        estimatedExpiresAt: 1702592000000,
      };

      expect(() => mapper.toEntity(item)).toThrow();
    });
  });

  describe('buildKeys', () => {
    it('userId から PK/SK を構築できる', () => {
      const keys = mapper.buildKeys({ userId: 'user123' });

      expect(keys.pk).toBe('USER#user123');
      expect(keys.sk).toBe(NICONICO_CREDENTIAL_SK);
    });

    it('PK と SK が動画設定と重複しない形式になる', () => {
      const credentialKeys = mapper.buildKeys({ userId: 'user123' });

      // 動画設定の SK は VIDEO#{videoId} 形式
      // 資格情報の SK は CREDENTIAL#niconico 形式で混在しない
      expect(credentialKeys.sk).not.toMatch(/^VIDEO#/);
      expect(credentialKeys.sk).toBe('CREDENTIAL#niconico');
    });
  });

  describe('往復変換（toItem → toEntity）', () => {
    it('Entity を Item に変換して再び Entity に変換すると同じ値になる', () => {
      const item = mapper.toItem(sampleEntity);
      const restored = mapper.toEntity(item);

      expect(restored.userId).toBe(sampleEntity.userId);
      expect(restored.encryptedUserSession).toBe(sampleEntity.encryptedUserSession);
      expect(restored.acquiredAt).toBe(sampleEntity.acquiredAt);
      expect(restored.estimatedExpiresAt).toBe(sampleEntity.estimatedExpiresAt);
    });
  });
});
