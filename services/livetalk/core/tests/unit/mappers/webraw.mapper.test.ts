import { InvalidEntityDataError } from '@nagiyu/aws';
import { WebRawMapper } from '../../../src/mappers/webraw.mapper.js';
import type { WebRawEntity } from '../../../src/entities/webraw.entity.js';

const baseEntity: WebRawEntity = {
  UserID: 'user1',
  CharacterID: 'hiyori',
  RawID: 'RAW-001',
  Query: 'コーヒー 効能',
  RawText: 'コーヒーには覚醒効果があります。',
  SourceUrls: ['https://example.com/coffee'],
  CreatedAt: 1_750_000_000_000,
};

describe('WebRawMapper', () => {
  let mapper: WebRawMapper;

  beforeEach(() => {
    mapper = new WebRawMapper();
  });

  describe('toItem', () => {
    it('エンティティを DynamoDB Item に変換する', () => {
      const item = mapper.toItem(baseEntity);
      expect(item.PK).toBe('USER#user1');
      expect(item.SK).toBe('CHAR#hiyori#WEBRAW#RAW-001');
      expect(item.Type).toBe('WebRaw');
      expect(item.Query).toBe('コーヒー 効能');
      expect(item.RawText).toBe('コーヒーには覚醒効果があります。');
      expect(item.SourceUrls).toEqual(['https://example.com/coffee']);
    });
  });

  describe('toEntity', () => {
    it('DynamoDB Item をエンティティに復元する', () => {
      const item = mapper.toItem(baseEntity);
      const entity = mapper.toEntity(item);
      expect(entity).toEqual(baseEntity);
    });

    it('RawText の空文字を許可する', () => {
      const item = mapper.toItem({ ...baseEntity, RawText: '' });
      const entity = mapper.toEntity(item);
      expect(entity.RawText).toBe('');
    });

    it('SourceUrls が配列でない場合は空配列にする', () => {
      const item = mapper.toItem(baseEntity);
      delete (item as Record<string, unknown>).SourceUrls;
      const entity = mapper.toEntity(item);
      expect(entity.SourceUrls).toEqual([]);
    });

    it('必須フィールド欠落で InvalidEntityDataError を投げる', () => {
      const item = mapper.toItem(baseEntity);
      delete (item as Record<string, unknown>).Query;
      expect(() => mapper.toEntity(item)).toThrow(InvalidEntityDataError);
    });
  });

  describe('buildKeys', () => {
    it('PK / SK を組み立てる', () => {
      const { pk, sk } = mapper.buildKeys({
        userId: 'user1',
        characterId: 'hiyori',
        rawId: 'RAW-001',
      });
      expect(pk).toBe('USER#user1');
      expect(sk).toBe('CHAR#hiyori#WEBRAW#RAW-001');
    });
  });
});
