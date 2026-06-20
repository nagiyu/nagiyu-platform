/**
 * InMemoryNiconicoCredentialRepository のユニットテスト
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { InMemorySingleTableStore } from '@nagiyu/aws';
import { InMemoryNiconicoCredentialRepository } from '../../../src/repositories/inmemory-niconico-credential.repository.js';
import type { CreateNiconicoCredentialInput } from '../../../src/entities/niconico-credential.entity.js';

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
      const result = await repository.getByUserId('nonexistent');
      expect(result).toBeNull();
    });

    it('保存済みの資格情報を取得できる', async () => {
      await repository.upsert(sampleCredential);
      const result = await repository.getByUserId('user123');

      expect(result).not.toBeNull();
      expect(result?.userId).toBe('user123');
      expect(result?.encryptedUserSession).toBe(sampleCredential.encryptedUserSession);
      expect(result?.acquiredAt).toBe(1700000000000);
      expect(result?.estimatedExpiresAt).toBe(1702592000000);
    });

    it('別ユーザーの資格情報は取得できない', async () => {
      await repository.upsert(sampleCredential);
      const result = await repository.getByUserId('anotherUser');
      expect(result).toBeNull();
    });
  });

  describe('upsert', () => {
    it('新規保存できる', async () => {
      const result = await repository.upsert(sampleCredential);

      expect(result.userId).toBe('user123');
      expect(result.encryptedUserSession).toBe(sampleCredential.encryptedUserSession);
      expect(result.acquiredAt).toBe(1700000000000);
      expect(result.estimatedExpiresAt).toBe(1702592000000);
    });

    it('既存の資格情報を上書きできる（upsert）', async () => {
      await repository.upsert(sampleCredential);

      const updated: CreateNiconicoCredentialInput = {
        userId: 'user123',
        encryptedUserSession: JSON.stringify({
          ciphertext: 'newCiphertext',
          iv: 'newIv',
          authTag: 'newAuthTag',
        }),
        acquiredAt: 1700000100000,
        estimatedExpiresAt: 1702592100000,
      };

      await repository.upsert(updated);
      const result = await repository.getByUserId('user123');

      expect(result?.encryptedUserSession).toBe(updated.encryptedUserSession);
      expect(result?.acquiredAt).toBe(1700000100000);
      expect(result?.estimatedExpiresAt).toBe(1702592100000);
    });

    it('複数ユーザーの資格情報を独立して保存できる', async () => {
      await repository.upsert(sampleCredential);
      await repository.upsert({
        ...sampleCredential,
        userId: 'user456',
        acquiredAt: 1700000200000,
      });

      const result1 = await repository.getByUserId('user123');
      const result2 = await repository.getByUserId('user456');

      expect(result1?.userId).toBe('user123');
      expect(result1?.acquiredAt).toBe(1700000000000);
      expect(result2?.userId).toBe('user456');
      expect(result2?.acquiredAt).toBe(1700000200000);
    });
  });

  describe('delete', () => {
    it('保存済みの資格情報を削除できる', async () => {
      await repository.upsert(sampleCredential);
      await repository.delete('user123');

      const result = await repository.getByUserId('user123');
      expect(result).toBeNull();
    });

    it('存在しない資格情報を削除してもエラーにならない', async () => {
      await expect(repository.delete('nonexistent')).resolves.not.toThrow();
    });

    it('一方のユーザーを削除しても他ユーザーには影響しない', async () => {
      await repository.upsert(sampleCredential);
      await repository.upsert({ ...sampleCredential, userId: 'user456' });

      await repository.delete('user123');

      const result1 = await repository.getByUserId('user123');
      const result2 = await repository.getByUserId('user456');

      expect(result1).toBeNull();
      expect(result2).not.toBeNull();
    });
  });

  describe('共通ストアの使用', () => {
    it('別のリポジトリインスタンスと同じストアを共有できる', () => {
      const anotherRepository = new InMemoryNiconicoCredentialRepository(store);
      expect(anotherRepository).toBeDefined();
    });

    it('同じストアを共有する複数インスタンスでデータが共有される', async () => {
      const repo2 = new InMemoryNiconicoCredentialRepository(store);

      await repository.upsert(sampleCredential);
      const result = await repo2.getByUserId('user123');

      expect(result).not.toBeNull();
      expect(result?.userId).toBe('user123');
    });
  });
});
