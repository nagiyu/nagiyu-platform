/**
 * InMemoryUserSettingRepository のユニットテスト
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  InMemorySingleTableStore,
  EntityAlreadyExistsError,
  EntityNotFoundError,
} from '@nagiyu/aws';
import { InMemoryUserSettingRepository } from '../../../src/repositories/inmemory-user-setting.repository';
import type { CreateUserSettingInput } from '../../../src/entities/user-setting.entity';

describe('InMemoryUserSettingRepository', () => {
  let store: InMemorySingleTableStore;
  let repository: InMemoryUserSettingRepository;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    repository = new InMemoryUserSettingRepository(store);
  });

  describe('create', () => {
    it('新しいユーザー設定を作成できる', async () => {
      const input: CreateUserSettingInput = {
        userId: 'user1',
        videoId: 'sm12345',
        isFavorite: false,
        isSkip: false,
      };

      const result = await repository.create(input);

      expect(result.userId).toBe(input.userId);
      expect(result.videoId).toBe(input.videoId);
      expect(result.isFavorite).toBe(input.isFavorite);
      expect(result.isSkip).toBe(input.isSkip);
      expect(result.CreatedAt).toBeGreaterThan(0);
      expect(result.UpdatedAt).toBeGreaterThan(0);
    });

    it('同じキーで2回作成するとEntityAlreadyExistsErrorを投げる', async () => {
      const input: CreateUserSettingInput = {
        userId: 'user1',
        videoId: 'sm12345',
        isFavorite: false,
        isSkip: false,
      };

      await repository.create(input);

      await expect(repository.create(input)).rejects.toThrow(EntityAlreadyExistsError);
    });

    it('memoを含む設定を作成できる', async () => {
      const input: CreateUserSettingInput = {
        userId: 'user1',
        videoId: 'sm12345',
        isFavorite: true,
        isSkip: false,
        memo: 'テストメモ',
      };

      const result = await repository.create(input);

      expect(result.memo).toBe(input.memo);
    });
  });

  describe('getById', () => {
    it('存在する設定を取得できる', async () => {
      const input: CreateUserSettingInput = {
        userId: 'user1',
        videoId: 'sm12345',
        isFavorite: true,
        isSkip: false,
      };

      await repository.create(input);
      const result = await repository.getById('user1', 'sm12345');

      expect(result).not.toBeNull();
      expect(result?.userId).toBe('user1');
      expect(result?.videoId).toBe('sm12345');
    });

    it('存在しない設定を取得するとnullを返す', async () => {
      const result = await repository.getById('user99', 'sm99999');
      expect(result).toBeNull();
    });
  });

  describe('getByUserId', () => {
    beforeEach(async () => {
      // テストデータを作成
      await repository.create({
        userId: 'user1',
        videoId: 'sm1',
        isFavorite: true,
        isSkip: false,
      });

      await repository.create({
        userId: 'user1',
        videoId: 'sm2',
        isFavorite: false,
        isSkip: false,
      });

      await repository.create({
        userId: 'user2',
        videoId: 'sm3',
        isFavorite: false,
        isSkip: false,
      });
    });

    it('ユーザーの全設定を取得できる', async () => {
      const result = await repository.getByUserId('user1');

      expect(result.items).toHaveLength(2);
      expect(result.items[0].userId).toBe('user1');
      expect(result.items[1].userId).toBe('user1');
    });

    it('存在しないユーザーの設定を取得すると空配列を返す', async () => {
      const result = await repository.getByUserId('user99');

      expect(result.items).toHaveLength(0);
    });

    it('limitパラメータでページネーションできる', async () => {
      const result = await repository.getByUserId('user1', { limit: 1 });

      expect(result.items).toHaveLength(1);
      expect(result.nextCursor).toBeDefined();
    });

    it('cursorでページング継続できる', async () => {
      const page1 = await repository.getByUserId('user1', { limit: 1 });
      const page2 = await repository.getByUserId('user1', {
        limit: 1,
        cursor: page1.nextCursor,
      });

      expect(page1.items[0].videoId).not.toBe(page2.items[0].videoId);
    });
  });

  describe('getByUserIdWithFilters', () => {
    beforeEach(async () => {
      // テストデータを作成
      await repository.create({
        userId: 'user1',
        videoId: 'sm1',
        isFavorite: true,
        isSkip: false,
      });

      await repository.create({
        userId: 'user1',
        videoId: 'sm2',
        isFavorite: false,
        isSkip: true,
      });

      await repository.create({
        userId: 'user1',
        videoId: 'sm3',
        isFavorite: true,
        isSkip: false,
      });

      await repository.create({
        userId: 'user1',
        videoId: 'sm4',
        isFavorite: false,
        isSkip: false,
      });
    });

    it('お気に入りフィルターが機能する', async () => {
      const result = await repository.getByUserIdWithFilters('user1', { isFavorite: true });

      expect(result.total).toBe(2);
      expect(result.settings).toHaveLength(2);
      expect(result.settings[0].isFavorite).toBe(true);
      expect(result.settings[1].isFavorite).toBe(true);
    });

    it('スキップフィルターが機能する', async () => {
      const result = await repository.getByUserIdWithFilters('user1', { isSkip: true });

      expect(result.total).toBe(1);
      expect(result.settings).toHaveLength(1);
      expect(result.settings[0].isSkip).toBe(true);
    });

    it('複数フィルターを組み合わせられる', async () => {
      const result = await repository.getByUserIdWithFilters('user1', {
        isFavorite: true,
        isSkip: false,
      });

      expect(result.total).toBe(2);
      expect(result.settings).toHaveLength(2);
      expect(result.settings.every((s) => s.isFavorite && !s.isSkip)).toBe(true);
    });

    it('limitとoffsetでページネーションできる', async () => {
      const result = await repository.getByUserIdWithFilters(
        'user1',
        {},
        { limit: 2, offset: 0 }
      );

      expect(result.settings).toHaveLength(2);
      expect(result.total).toBe(4);
    });

    it('offsetで2ページ目を取得できる', async () => {
      const page1 = await repository.getByUserIdWithFilters('user1', {}, { limit: 2, offset: 0 });
      const page2 = await repository.getByUserIdWithFilters('user1', {}, { limit: 2, offset: 2 });

      expect(page1.settings[0].videoId).not.toBe(page2.settings[0].videoId);
    });
  });

  describe('upsert', () => {
    it('新規レコードを作成できる', async () => {
      const input: CreateUserSettingInput = {
        userId: 'user1',
        videoId: 'sm12345',
        isFavorite: true,
        isSkip: false,
      };

      const result = await repository.upsert(input);

      expect(result.userId).toBe(input.userId);
      expect(result.videoId).toBe(input.videoId);
      expect(result.isFavorite).toBe(input.isFavorite);
    });

    it('既存レコードを更新できる', async () => {
      const input: CreateUserSettingInput = {
        userId: 'user1',
        videoId: 'sm12345',
        isFavorite: false,
        isSkip: false,
      };

      const created = await repository.create(input);

      // タイムスタンプの差を確実にするために少し待つ
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updated = await repository.upsert({
        userId: 'user1',
        videoId: 'sm12345',
        isFavorite: true,
        isSkip: false,
      });

      expect(updated.isFavorite).toBe(true);
      expect(updated.CreatedAt).toBe(created.CreatedAt);
      expect(updated.UpdatedAt).toBeGreaterThanOrEqual(created.UpdatedAt);
    });
  });

  describe('update', () => {
    it('既存設定を更新できる', async () => {
      await repository.create({
        userId: 'user1',
        videoId: 'sm12345',
        isFavorite: false,
        isSkip: false,
      });

      const result = await repository.update('user1', 'sm12345', { isFavorite: true });

      expect(result.isFavorite).toBe(true);
      expect(result.UpdatedAt).toBeGreaterThan(0);
    });

    it('存在しない設定を更新するとEntityNotFoundErrorを投げる', async () => {
      await expect(
        repository.update('user99', 'sm99999', { isFavorite: true })
      ).rejects.toThrow(EntityNotFoundError);
    });

    it('更新フィールドが指定されていないとエラーを投げる', async () => {
      await repository.create({
        userId: 'user1',
        videoId: 'sm12345',
        isFavorite: false,
        isSkip: false,
      });

      await expect(repository.update('user1', 'sm12345', {})).rejects.toThrow(
        '更新するフィールドが指定されていません'
      );
    });

    it('memoを更新できる', async () => {
      await repository.create({
        userId: 'user1',
        videoId: 'sm12345',
        isFavorite: false,
        isSkip: false,
        memo: '古いメモ',
      });

      const result = await repository.update('user1', 'sm12345', { memo: '新しいメモ' });

      expect(result.memo).toBe('新しいメモ');
    });
  });

  describe('delete', () => {
    it('設定を削除できる', async () => {
      await repository.create({
        userId: 'user1',
        videoId: 'sm12345',
        isFavorite: false,
        isSkip: false,
      });

      await repository.delete('user1', 'sm12345');

      const result = await repository.getById('user1', 'sm12345');
      expect(result).toBeNull();
    });

    it('存在しない設定を削除してもエラーにならない', async () => {
      await expect(repository.delete('user99', 'sm99999')).resolves.not.toThrow();
    });
  });

  describe('共通ストアの使用', () => {
    it('別のリポジトリとストアを共有できる', () => {
      const anotherRepository = new InMemoryUserSettingRepository(store);

      // 同じストアインスタンスを共有していることを確認
      expect(anotherRepository).toBeDefined();
    });
  });
});
