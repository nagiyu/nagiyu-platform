/**
 * Video Mapper のテスト
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { InvalidEntityDataError, REMOVE_ATTRIBUTE } from '@nagiyu/aws';
import { VideoMapper } from '../../../src/mappers/video.mapper.js';
import type { VideoEntity } from '../../../src/entities/video.entity.js';

const TIMESTAMP = 1234567890000;
const KEY = { videoId: 'sm12345' };

function buildEntity(overrides: Partial<VideoEntity> = {}): VideoEntity {
  return {
    videoId: 'sm12345',
    title: 'Test Video',
    thumbnailUrl: 'https://example.com/thumb.jpg',
    length: '5:00',
    createdAt: TIMESTAMP,
    ...overrides,
  };
}

function buildItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    PK: 'VIDEO#sm12345',
    SK: 'VIDEO#sm12345',
    Type: 'VIDEO',
    VideoID: 'sm12345',
    Title: 'Test Video',
    ThumbnailURL: 'https://example.com/thumb.jpg',
    Length: '5:00',
    CreatedAt: TIMESTAMP,
    UpdatedAt: TIMESTAMP,
    ...overrides,
  };
}

describe('VideoMapper', () => {
  let mapper: VideoMapper;

  beforeEach(() => {
    mapper = new VideoMapper();
  });

  it('entityType は VIDEO になる', () => {
    expect(mapper.entityType).toBe('VIDEO');
  });

  it('新属性名に対する旧属性名 (camelCase) を宣言する', () => {
    expect(mapper.legacyAttributeNames).toEqual({
      VideoID: ['videoId'],
      Title: ['title'],
      ThumbnailURL: ['thumbnailUrl'],
      Length: ['length'],
      VideoUpdatedAt: ['videoUpdatedAt'],
    });
  });

  describe('buildKeys / getKey', () => {
    it('ビジネスキーから PK/SK を構築できる', () => {
      expect(mapper.buildKeys(KEY)).toEqual({ PK: 'VIDEO#sm12345', SK: 'VIDEO#sm12345' });
    });

    it('PK が先頭のキー属性になる', () => {
      expect(Object.keys(mapper.buildKeys(KEY))).toEqual(['PK', 'SK']);
    });

    it('Entity からビジネスキーを取り出せる', () => {
      expect(mapper.getKey(buildEntity())).toEqual(KEY);
    });
  });

  describe('toItem', () => {
    it('Entity を PascalCase の属性名の Item に変換する (UpdatedAt は store が書く)', () => {
      const { UpdatedAt: _updatedAt, ...expected } = buildItem();

      expect(mapper.toItem(buildEntity())).toEqual(expected);
    });

    it('videoUpdatedAt を VideoUpdatedAt で保存する', () => {
      const item = mapper.toItem(buildEntity({ videoUpdatedAt: 1234567900000 }));

      expect(item.VideoUpdatedAt).toBe(1234567900000);
      expect(item).not.toHaveProperty('videoUpdatedAt');
    });

    it('旧属性名は書かない', () => {
      const item = mapper.toItem(buildEntity({ videoUpdatedAt: 1234567900000 }));

      for (const legacyName of ['videoId', 'title', 'thumbnailUrl', 'length', 'videoUpdatedAt']) {
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

    it('VideoUpdatedAt を読める', () => {
      const entity = mapper.toEntity(buildItem({ VideoUpdatedAt: 1234567900000 }));

      expect(entity.videoUpdatedAt).toBe(1234567900000);
    });

    it('旧属性名 (camelCase) の Item も読める', () => {
      const entity = mapper.toEntity({
        PK: 'VIDEO#sm12345',
        SK: 'VIDEO#sm12345',
        Type: 'VIDEO',
        videoId: 'sm12345',
        title: 'Legacy Title',
        thumbnailUrl: 'https://example.com/legacy.jpg',
        length: '1:23',
        videoUpdatedAt: 1234567900000,
        CreatedAt: TIMESTAMP,
        UpdatedAt: TIMESTAMP,
      });

      expect(entity).toEqual({
        videoId: 'sm12345',
        title: 'Legacy Title',
        thumbnailUrl: 'https://example.com/legacy.jpg',
        length: '1:23',
        videoUpdatedAt: 1234567900000,
        createdAt: TIMESTAMP,
      });
    });

    it('新旧の属性名が併存するときは新名を優先する', () => {
      const entity = mapper.toEntity(
        buildItem({
          Title: '新',
          title: '旧',
          VideoUpdatedAt: 1234567900000,
          videoUpdatedAt: 1234567800000,
        })
      );

      expect(entity.title).toBe('新');
      expect(entity.videoUpdatedAt).toBe(1234567900000);
    });

    it('ISO 文字列の CreatedAt も読める', () => {
      const entity = mapper.toEntity(buildItem({ CreatedAt: '2024-01-01T00:00:00.000Z' }));

      expect(entity.createdAt).toBe(Date.parse('2024-01-01T00:00:00.000Z'));
    });

    it.each(['VideoID', 'Title', 'ThumbnailURL', 'Length', 'CreatedAt'])(
      '必須属性 %s が欠けていると InvalidEntityDataError になる',
      (name) => {
        const item = buildItem();
        delete item[name];

        expect(() => mapper.toEntity(item)).toThrow(InvalidEntityDataError);
      }
    );
  });

  describe('toUpdateAttributes', () => {
    it('変更された項目だけを保存用の属性名で返す', () => {
      const attributes = mapper.toUpdateAttributes({ title: '新タイトル', length: '9:99' });

      expect(attributes.Title).toBe('新タイトル');
      expect(attributes.Length).toBe('9:99');
      expect(attributes.ThumbnailURL).toBeUndefined();
      expect(attributes).not.toHaveProperty('title');
    });

    it('任意項目 videoUpdatedAt は null で属性の削除になる', () => {
      expect(mapper.toUpdateAttributes({ videoUpdatedAt: null }).VideoUpdatedAt).toBe(
        REMOVE_ATTRIBUTE
      );
    });

    it.each([
      ['title', 'Title'],
      ['thumbnailUrl', 'ThumbnailURL'],
      ['length', 'Length'],
    ] as const)('必須項目 %s に null を渡すと InvalidEntityDataError になる', (field) => {
      expect(() => mapper.toUpdateAttributes({ [field]: null })).toThrow(InvalidEntityDataError);
    });

    it.each(['videoId', 'createdAt'] as const)(
      '変更できない項目 %s を含めると InvalidEntityDataError になる',
      (field) => {
        const value = field === 'createdAt' ? 1 : 'sm12345';

        expect(() => mapper.toUpdateAttributes({ [field]: value })).toThrow(InvalidEntityDataError);
      }
    );
  });
});
