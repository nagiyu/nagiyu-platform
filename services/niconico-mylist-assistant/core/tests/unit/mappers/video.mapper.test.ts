/**
 * Video Mapper のテスト
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { VideoMapper } from '../../../src/mappers/video.mapper.js';
import type { VideoEntity } from '../../../src/entities/video.entity.js';

describe('VideoMapper', () => {
  let mapper: VideoMapper;

  beforeEach(() => {
    mapper = new VideoMapper();
  });

  describe('toItem', () => {
    it('必須フィールドのみの Entity を Item に変換できる', () => {
      const entity: VideoEntity = {
        videoId: 'sm12345',
        title: 'Test Video',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        length: '5:00',
        CreatedAt: 1234567890000,
      };

      const item = mapper.toItem(entity);

      expect(item.PK).toBe('VIDEO#sm12345');
      expect(item.SK).toBe('VIDEO#sm12345');
      expect(item.Type).toBe('VIDEO');
      expect(item.videoId).toBe('sm12345');
      expect(item.title).toBe('Test Video');
      expect(item.thumbnailUrl).toBe('https://example.com/thumb.jpg');
      expect(item.length).toBe('5:00');
      expect(item.CreatedAt).toBe(1234567890000);
      expect(item.UpdatedAt).toBe(1234567890000);
    });

    it('オプショナルフィールド videoUpdatedAt を含む Entity を変換できる', () => {
      const entity: VideoEntity = {
        videoId: 'sm12345',
        title: 'Test Video',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        length: '5:00',
        CreatedAt: 1234567890000,
        videoUpdatedAt: 1234567900000,
      };

      const item = mapper.toItem(entity);

      expect(item.videoUpdatedAt).toBe(1234567900000);
    });
  });

  describe('toEntity', () => {
    it('必須フィールドのみの Item を Entity に変換できる', () => {
      const item = {
        PK: 'VIDEO#sm12345',
        SK: 'VIDEO#sm12345',
        Type: 'VIDEO',
        videoId: 'sm12345',
        title: 'Test Video',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        length: '5:00',
        CreatedAt: 1234567890000,
        UpdatedAt: 1234567890000,
      };

      const entity = mapper.toEntity(item);

      expect(entity.videoId).toBe('sm12345');
      expect(entity.title).toBe('Test Video');
      expect(entity.thumbnailUrl).toBe('https://example.com/thumb.jpg');
      expect(entity.length).toBe('5:00');
      expect(entity.CreatedAt).toBe(1234567890000);
    });

    it('オプショナルフィールド videoUpdatedAt を含む Item を変換できる', () => {
      const item = {
        PK: 'VIDEO#sm12345',
        SK: 'VIDEO#sm12345',
        Type: 'VIDEO',
        videoId: 'sm12345',
        title: 'Test Video',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        length: '5:00',
        CreatedAt: 1234567890000,
        UpdatedAt: 1234567890000,
        videoUpdatedAt: 1234567900000,
      };

      const entity = mapper.toEntity(item);

      expect(entity.videoUpdatedAt).toBe(1234567900000);
    });
  });

  describe('buildKeys', () => {
    it('ビジネスキーから PK/SK を構築できる', () => {
      const keys = mapper.buildKeys({
        videoId: 'sm12345',
      });

      expect(keys.pk).toBe('VIDEO#sm12345');
      expect(keys.sk).toBe('VIDEO#sm12345');
    });
  });
});
