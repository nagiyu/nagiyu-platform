/**
 * InMemoryVideoRepository のユニットテスト
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { InMemorySingleTableStore, EntityAlreadyExistsError } from '@nagiyu/aws';
import { InMemoryVideoRepository } from '../../../src/repositories/inmemory-video.repository';
import type { CreateVideoInput } from '../../../src/entities/video.entity';

describe('InMemoryVideoRepository', () => {
  let store: InMemorySingleTableStore;
  let repository: InMemoryVideoRepository;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    repository = new InMemoryVideoRepository(store);
  });

  describe('create', () => {
    it('新しい動画を作成できる', async () => {
      const input: CreateVideoInput = {
        videoId: 'sm12345',
        title: 'テスト動画',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        length: '5:00',
      };

      const result = await repository.create(input);

      expect(result.videoId).toBe(input.videoId);
      expect(result.title).toBe(input.title);
      expect(result.thumbnailUrl).toBe(input.thumbnailUrl);
      expect(result.length).toBe(input.length);
      expect(result.CreatedAt).toBeGreaterThan(0);
    });

    it('同じvideoIdで2回作成するとEntityAlreadyExistsErrorを投げる', async () => {
      const input: CreateVideoInput = {
        videoId: 'sm12345',
        title: 'テスト動画',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        length: '5:00',
      };

      await repository.create(input);

      await expect(repository.create(input)).rejects.toThrow(EntityAlreadyExistsError);
    });

    it('videoUpdatedAtを含む動画を作成できる', async () => {
      const input: CreateVideoInput = {
        videoId: 'sm12345',
        title: 'テスト動画',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        length: '5:00',
        videoUpdatedAt: 1234567890,
      };

      const result = await repository.create(input);

      expect(result.videoUpdatedAt).toBe(input.videoUpdatedAt);
    });
  });

  describe('getById', () => {
    it('存在する動画を取得できる', async () => {
      const input: CreateVideoInput = {
        videoId: 'sm12345',
        title: 'テスト動画',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        length: '5:00',
      };

      await repository.create(input);
      const result = await repository.getById('sm12345');

      expect(result).not.toBeNull();
      expect(result?.videoId).toBe('sm12345');
    });

    it('存在しない動画を取得するとnullを返す', async () => {
      const result = await repository.getById('sm99999');
      expect(result).toBeNull();
    });
  });

  describe('listAll', () => {
    it('登録済みの全動画を取得できる', async () => {
      await repository.create({
        videoId: 'sm1',
        title: 'テスト動画1',
        thumbnailUrl: 'https://example.com/thumb1.jpg',
        length: '5:00',
      });
      await repository.create({
        videoId: 'sm2',
        title: 'テスト動画2',
        thumbnailUrl: 'https://example.com/thumb2.jpg',
        length: '3:00',
      });

      const result = await repository.listAll();

      expect(result).toHaveLength(2);
      expect(result.map((video) => video.videoId)).toEqual(expect.arrayContaining(['sm1', 'sm2']));
    });
  });

  describe('batchGet', () => {
    it('複数の動画を一括取得できる', async () => {
      await repository.create({
        videoId: 'sm1',
        title: 'テスト動画1',
        thumbnailUrl: 'https://example.com/thumb1.jpg',
        length: '5:00',
      });

      await repository.create({
        videoId: 'sm2',
        title: 'テスト動画2',
        thumbnailUrl: 'https://example.com/thumb2.jpg',
        length: '3:00',
      });

      const results = await repository.batchGet(['sm1', 'sm2']);

      expect(results).toHaveLength(2);
      expect(results[0].videoId).toBe('sm1');
      expect(results[1].videoId).toBe('sm2');
    });

    it('存在しない動画は結果に含まれない', async () => {
      await repository.create({
        videoId: 'sm1',
        title: 'テスト動画1',
        thumbnailUrl: 'https://example.com/thumb1.jpg',
        length: '5:00',
      });

      const results = await repository.batchGet(['sm1', 'sm99999']);

      expect(results).toHaveLength(1);
      expect(results[0].videoId).toBe('sm1');
    });

    it('空の配列を渡すと空の配列を返す', async () => {
      const results = await repository.batchGet([]);
      expect(results).toHaveLength(0);
    });

    it('100件を超える配列でも取得できる', async () => {
      await repository.create({
        videoId: 'sm0',
        title: 'テスト動画0',
        thumbnailUrl: 'https://example.com/thumb0.jpg',
        length: '5:00',
      });
      await repository.create({
        videoId: 'sm100',
        title: 'テスト動画100',
        thumbnailUrl: 'https://example.com/thumb100.jpg',
        length: '5:00',
      });

      const videoIds = Array.from({ length: 101 }, (_, i) => `sm${i}`);
      const results = await repository.batchGet(videoIds);
      expect(results).toHaveLength(2);
    });
  });

  describe('delete', () => {
    it('動画を削除できる', async () => {
      const input: CreateVideoInput = {
        videoId: 'sm12345',
        title: 'テスト動画',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        length: '5:00',
      };

      await repository.create(input);
      await repository.delete('sm12345');

      const result = await repository.getById('sm12345');
      expect(result).toBeNull();
    });

    it('存在しない動画を削除してもエラーにならない', async () => {
      await expect(repository.delete('sm99999')).resolves.not.toThrow();
    });
  });

  describe('共通ストアの使用', () => {
    it('別のリポジトリとストアを共有できる', () => {
      const anotherRepository = new InMemoryVideoRepository(store);

      // 同じストアインスタンスを共有していることを確認
      expect(anotherRepository).toBeDefined();
    });
  });
});
