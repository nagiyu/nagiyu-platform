import { InvalidEntityDataError } from '@nagiyu/aws';
import { WebFactMapper } from '../../../src/mappers/web-fact.mapper.js';
import type { WebFactEntity } from '../../../src/entities/web-fact.entity.js';

const baseEntity: WebFactEntity = {
  UserID: 'user1',
  CharacterID: 'hiyori',
  TopicID: 'TOPIC-001',
  FactID: 'FACT-001',
  Text: '2026年の新作アニメが発表された',
  SourceUrls: ['https://example.com/news'],
  Volatility: 'medium',
  ObservedAt: 1_749_999_000_000,
  CreatedAt: 1_750_000_000_000,
};

describe('WebFactMapper', () => {
  let mapper: WebFactMapper;

  beforeEach(() => {
    mapper = new WebFactMapper();
  });

  describe('toItem', () => {
    it('エンティティを DynamoDB Item に変換する', () => {
      const item = mapper.toItem(baseEntity);
      expect(item.PK).toBe('USER#user1');
      expect(item.SK).toBe('CHAR#hiyori#TOPIC#TOPIC-001#WEB#FACT-001');
      expect(item.Type).toBe('WebFact');
      expect(item.SourceUrls).toEqual(['https://example.com/news']);
      expect(item.Volatility).toBe('medium');
      expect(item.ObservedAt).toBe(1_749_999_000_000);
    });

    it('NextReview 未設定時は Item に含めない', () => {
      const item = mapper.toItem(baseEntity);
      expect('NextReview' in item).toBe(false);
    });

    it('NextReview 設定時は Item に含める', () => {
      const item = mapper.toItem({ ...baseEntity, NextReview: 1_750_500_000_000 });
      expect(item.NextReview).toBe(1_750_500_000_000);
    });

    it('NextReview 未設定時は GSI4PK/GSI4SK を付与しない（sparse GSI）', () => {
      const item = mapper.toItem(baseEntity);
      expect('GSI4PK' in item).toBe(false);
      expect('GSI4SK' in item).toBe(false);
    });

    it('NextReview 設定時は GSI4PK/GSI4SK を付与する（GSI-STALE）', () => {
      const item = mapper.toItem({ ...baseEntity, NextReview: 1_750_500_000_000 });
      expect(item.GSI4PK).toBe('hiyori#STALE#user1');
      expect(item.GSI4SK).toBe(1_750_500_000_000);
    });
  });

  describe('toEntity', () => {
    it('DynamoDB Item をエンティティに復元する', () => {
      const item = mapper.toItem(baseEntity);
      const entity = mapper.toEntity(item);
      expect(entity).toEqual(baseEntity);
    });

    it('NextReview を復元する', () => {
      const item = mapper.toItem({ ...baseEntity, NextReview: 1_750_500_000_000 });
      const entity = mapper.toEntity(item);
      expect(entity.NextReview).toBe(1_750_500_000_000);
    });

    it('NextReview が欠落していても GSI4SK から復元できる（GSI4 の Query 結果を想定）', () => {
      const item = mapper.toItem({ ...baseEntity, NextReview: 1_750_500_000_000 });
      delete (item as Record<string, unknown>).NextReview;
      const entity = mapper.toEntity(item);
      expect(entity.NextReview).toBe(1_750_500_000_000);
    });

    it('SourceUrls が配列でない場合は空配列にする', () => {
      const item = mapper.toItem(baseEntity);
      delete (item as Record<string, unknown>).SourceUrls;
      const entity = mapper.toEntity(item);
      expect(entity.SourceUrls).toEqual([]);
    });

    it('不正な Volatility は InvalidEntityDataError を投げる', () => {
      const item = mapper.toItem(baseEntity);
      (item as Record<string, unknown>).Volatility = 'invalid';
      expect(() => mapper.toEntity(item)).toThrow(InvalidEntityDataError);
    });

    it('必須フィールド欠落で InvalidEntityDataError を投げる', () => {
      const item = mapper.toItem(baseEntity);
      delete (item as Record<string, unknown>).Text;
      expect(() => mapper.toEntity(item)).toThrow(InvalidEntityDataError);
    });
  });

  describe('buildKeys', () => {
    it('PK / SK を組み立てる', () => {
      const { pk, sk } = mapper.buildKeys({
        userId: 'user1',
        characterId: 'hiyori',
        topicId: 'TOPIC-001',
        factId: 'FACT-001',
      });
      expect(pk).toBe('USER#user1');
      expect(sk).toBe('CHAR#hiyori#TOPIC#TOPIC-001#WEB#FACT-001');
    });
  });
});
