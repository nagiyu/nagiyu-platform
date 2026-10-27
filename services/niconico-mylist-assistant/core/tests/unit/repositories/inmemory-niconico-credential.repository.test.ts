/**
 * InMemoryNiconicoCredentialRepository のユニットテスト
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { InMemorySingleTableStore, EntityNotFoundError } from '@nagiyu/aws';
import { InMemoryNiconicoCredentialRepository } from '../../../src/repositories/inmemory-niconico-credential.repository.js';
import type { CreateNiconicoCredentialInput } from '../../../src/entities/niconico-credential.entity.js';

const PK = 'USER#user123';
const SK = 'CREDENTIAL#niconico';

describe('InMemoryNiconicoCredentialRepository', () => {
  let store: InMemorySingleTableStore;
  let repository: InMemoryNiconicoCredentialRepository;

  const sampleCredential: CreateNiconicoCredentialInput = {
    userId: 'user123',
    encryptedUserSession: JSON.stringify({
      ciphertext: 'dummyCiphertext',
      iv: 'dummyIv',
      authTag: 'dummyAuthTag',
    }),
    acquiredAt: 1700000000000,
    estimatedExpiresAt: 1702592000000,
  };

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    repository = new InMemoryNiconicoCredentialRepository(store);
  });

  describe('getByUserId', () => {
    it('保存されていない場合は null を返す', async () => {
      expect(await repository.getByUserId('nonexistent')).toBeNull();
    });

    it('保存済みの資格情報を取得できる', async () => {
      await repository.upsert(sampleCredential);

      expect(await repository.getByUserId('user123')).toEqual(sampleCredential);
    });

    it('別ユーザーの資格情報は取得できない', async () => {
      await repository.upsert(sampleCredential);

      expect(await repository.getByUserId('anotherUser')).toBeNull();
    });
  });

  describe('upsert', () => {
    it('新規保存できる', async () => {
      expect(await repository.upsert(sampleCredential)).toEqual(sampleCredential);
    });

    it('既存の資格情報を上書きできる', async () => {
      await repository.upsert(sampleCredential);
      const updated = {
        ...sampleCredential,
        encryptedUserSession: 'new-blob',
        acquiredAt: 1710000000000,
        estimatedExpiresAt: 1712592000000,
      };

      await repository.upsert(updated);

      expect(await repository.getByUserId('user123')).toEqual(updated);
    });
  });

  describe('delete', () => {
    it('保存済みの資格情報を削除できる', async () => {
      await repository.upsert(sampleCredential);

      await repository.delete('user123');

      expect(await repository.getByUserId('user123')).toBeNull();
    });

    it('存在しない資格情報を削除すると EntityNotFoundError を投げる', async () => {
      await expect(repository.delete('nonexistent')).rejects.toThrow(EntityNotFoundError);
    });
  });

  describe('deleteIfExists', () => {
    it('保存済みの資格情報を削除できる', async () => {
      await repository.upsert(sampleCredential);

      await repository.deleteIfExists('user123');

      expect(await repository.getByUserId('user123')).toBeNull();
    });

    it('存在しなくても成功する', async () => {
      await expect(repository.deleteIfExists('nonexistent')).resolves.toBeUndefined();
    });
  });

  describe('保存形式', () => {
    const legacyItem = {
      PK,
      SK,
      Type: 'NICONICO_CREDENTIAL',
      userId: 'user123',
      encryptedUserSession: sampleCredential.encryptedUserSession,
      acquiredAt: 1700000000000,
      estimatedExpiresAt: 1702592000000,
      CreatedAt: 1700000000000,
      UpdatedAt: 1700000000000,
    };

    it('PascalCase の属性名で保存し、CreatedAt には acquiredAt を書く', async () => {
      await repository.upsert(sampleCredential);

      const item = store.get(PK, SK);

      expect(item).toMatchObject({
        Type: 'NICONICO_CREDENTIAL',
        UserID: 'user123',
        EncryptedUserSession: sampleCredential.encryptedUserSession,
        AcquiredAt: 1700000000000,
        EstimatedExpiresAt: 1702592000000,
        CreatedAt: 1700000000000,
      });
      for (const legacyName of [
        'userId',
        'encryptedUserSession',
        'acquiredAt',
        'estimatedExpiresAt',
      ]) {
        expect(item).not.toHaveProperty(legacyName);
      }
    });

    it('旧属性名 (camelCase) で保存されたアイテムを読める', async () => {
      store.put(legacyItem);

      expect(await repository.getByUserId('user123')).toEqual(sampleCredential);
    });

    it('旧属性名のアイテムを upsert すると新名だけで置き換わる', async () => {
      store.put(legacyItem);

      await repository.upsert({ ...sampleCredential, encryptedUserSession: 'new-blob' });

      const item = store.get(PK, SK);
      expect(item).toMatchObject({ EncryptedUserSession: 'new-blob' });
      for (const legacyName of [
        'userId',
        'encryptedUserSession',
        'acquiredAt',
        'estimatedExpiresAt',
      ]) {
        expect(item).not.toHaveProperty(legacyName);
      }
    });
  });
});
