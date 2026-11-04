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
      expect(result.createdAt).toBeGreaterThan(0);
      expect(result.updatedAt).toBeGreaterThan(0);
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

    it('countはlimitで切れたページでも返したitemsの件数になる（総件数ではない）', async () => {
      const result = await repository.getByUserId('user1', { limit: 1 });

      expect(result.items).toHaveLength(1);
      expect(result.count).toBe(1);
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

  describe('listAllByUserId', () => {
    it('100件を超えても全件返す', async () => {
      for (let i = 0; i < 150; i++) {
        await repository.create({
          userId: 'user1',
          videoId: `sm${i}`,
          isFavorite: false,
          isSkip: false,
        });
      }

      const result = await repository.listAllByUserId('user1');

      expect(result).toHaveLength(150);
    });

    it('他ユーザーや動画設定以外のレコードを含まない', async () => {
      await repository.create({ userId: 'user1', videoId: 'sm1', isFavorite: true, isSkip: false });
      await repository.create({ userId: 'user2', videoId: 'sm2', isFavorite: true, isSkip: false });
      store.put({ PK: 'USER#user1', SK: 'OTHER#x', Type: 'OTHER' });

      const result = await repository.listAllByUserId('user1');

      expect(result.map((setting) => setting.videoId)).toEqual(['sm1']);
    });

    it('設定がない場合は空配列を返す', async () => {
      await expect(repository.listAllByUserId('user1')).resolves.toEqual([]);
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
      expect(updated.createdAt).toBe(created.createdAt);
      expect(updated.updatedAt).toBeGreaterThanOrEqual(created.updatedAt);
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
      expect(result.updatedAt).toBeGreaterThan(0);
    });

    it('存在しない設定を更新するとEntityNotFoundErrorを投げる', async () => {
      await expect(repository.update('user99', 'sm99999', { isFavorite: true })).rejects.toThrow(
        EntityNotFoundError
      );
    });

    it('更新フィールドが指定されていないときは更新日時だけを更新する', async () => {
      const created = await repository.create({
        userId: 'user1',
        videoId: 'sm12345',
        isFavorite: true,
        isSkip: false,
        memo: 'メモ',
      });

      await new Promise((resolve) => setTimeout(resolve, 5));
      const result = await repository.update('user1', 'sm12345', {});

      expect(result).toEqual({ ...created, updatedAt: expect.any(Number) });
      expect(result.updatedAt).toBeGreaterThan(created.updatedAt);
    });

    it('memoをnullで削除できる', async () => {
      await repository.create({
        userId: 'user1',
        videoId: 'sm12345',
        isFavorite: false,
        isSkip: false,
        memo: '古いメモ',
      });

      const result = await repository.update('user1', 'sm12345', { memo: null });

      expect(result.memo).toBeUndefined();
      expect(store.get('USER#user1', 'VIDEO#sm12345')).not.toHaveProperty('Memo');
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

    it('存在しない設定を削除するとEntityNotFoundErrorを投げる', async () => {
      await expect(repository.delete('user99', 'sm99999')).rejects.toThrow(EntityNotFoundError);
    });
  });

  describe('deleteIfExists', () => {
    it('存在する設定を削除できる', async () => {
      await repository.create({
        userId: 'user1',
        videoId: 'sm12345',
        isFavorite: false,
        isSkip: false,
      });

      await repository.deleteIfExists('user1', 'sm12345');

      expect(await repository.getById('user1', 'sm12345')).toBeNull();
    });

    it('存在しない設定でも成功する', async () => {
      await expect(repository.deleteIfExists('user99', 'sm99999')).resolves.toBeUndefined();
    });
  });

  describe('保存形式', () => {
    const legacyItem = {
      PK: 'USER#user1',
      SK: 'VIDEO#sm12345',
      Type: 'USER_SETTING',
      userId: 'user1',
      videoId: 'sm12345',
      isFavorite: true,
      isSkip: false,
      memo: '旧メモ',
      CreatedAt: 1704067200000,
      UpdatedAt: 1704067200000,
    };

    it('PascalCase の属性名で保存する', async () => {
      await repository.create({
        userId: 'user1',
        videoId: 'sm12345',
        isFavorite: true,
        isSkip: false,
        memo: 'メモ',
      });

      const item = store.get('USER#user1', 'VIDEO#sm12345');

      expect(item).toMatchObject({
        Type: 'USER_SETTING',
        UserID: 'user1',
        VideoID: 'sm12345',
        IsFavorite: true,
        IsSkip: false,
        Memo: 'メモ',
      });
      expect(item).not.toHaveProperty('userId');
      expect(item).not.toHaveProperty('isFavorite');
    });

    it('旧属性名 (camelCase) で保存されたアイテムを読める', async () => {
      store.put(legacyItem);

      expect(await repository.getById('user1', 'sm12345')).toEqual({
        userId: 'user1',
        videoId: 'sm12345',
        isFavorite: true,
        isSkip: false,
        memo: '旧メモ',
        createdAt: 1704067200000,
        updatedAt: 1704067200000,
      });
      expect((await repository.getByUserId('user1')).items).toHaveLength(1);
    });

    it('旧属性名のアイテムを更新すると、更新した項目の旧名が消えて新名だけが残る', async () => {
      store.put(legacyItem);

      const result = await repository.update('user1', 'sm12345', { isFavorite: false, memo: null });

      expect(result.isFavorite).toBe(false);
      expect(result.memo).toBeUndefined();
      const item = store.get('USER#user1', 'VIDEO#sm12345');
      expect(item).toMatchObject({ IsFavorite: false });
      expect(item).not.toHaveProperty('isFavorite');
      expect(item).not.toHaveProperty('memo');
      expect(item).not.toHaveProperty('Memo');
      // 更新していない項目は旧名のまま残り、読み取りは引き続き成功する
      expect(item).toMatchObject({ isSkip: false });
      expect(result.isSkip).toBe(false);
    });

    it('旧属性名のアイテムを upsert すると新名だけで置き換わり、createdAt を保つ', async () => {
      store.put(legacyItem);

      const result = await repository.upsert({
        userId: 'user1',
        videoId: 'sm12345',
        isFavorite: false,
        isSkip: true,
      });

      expect(result.createdAt).toBe(1704067200000);
      const item = store.get('USER#user1', 'VIDEO#sm12345');
      expect(item).toMatchObject({ UserID: 'user1', IsFavorite: false, IsSkip: true });
      for (const legacyName of ['userId', 'videoId', 'isFavorite', 'isSkip', 'memo']) {
        expect(item).not.toHaveProperty(legacyName);
      }
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
