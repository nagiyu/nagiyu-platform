import { InvalidEntityDataError } from '@nagiyu/aws';
import { TopicMapper } from '../../../src/mappers/topic.mapper.js';
import type { TopicEntity } from '../../../src/entities/topic.entity.js';

const baseEntity: TopicEntity = {
  UserID: 'user1',
  CharacterID: 'hiyori',
  TopicID: 'TOPIC-001',
  Subject: 'コーヒー',
  CanonicalSummary: 'コーヒーが好きで毎朝飲んでいる。',
  Category: '飲み物',
  Care: 3.5,
  Embedding: [0.1, 0.2, 0.3],
  CreatedAt: 1_750_000_000_000,
  UpdatedAt: 1_750_086_400_000,
};

describe('TopicMapper', () => {
  let mapper: TopicMapper;

  beforeEach(() => {
    mapper = new TopicMapper();
  });

  describe('toItem', () => {
    it('エンティティを DynamoDB Item に変換する', () => {
      const item = mapper.toItem(baseEntity);
      expect(item.PK).toBe('USER#user1');
      expect(item.SK).toBe('CHAR#hiyori#TOPIC#TOPIC-001#META');
      expect(item.Type).toBe('Topic');
      expect(item.Subject).toBe('コーヒー');
      expect(item.CanonicalSummary).toBe('コーヒーが好きで毎朝飲んでいる。');
      expect(item.Category).toBe('飲み物');
      expect(item.Care).toBe(3.5);
      expect(item.Embedding).toEqual([0.1, 0.2, 0.3]);
    });

    it('GSI3PK/GSI3SK を付与する（sparse GSI-TOPIC）', () => {
      const item = mapper.toItem(baseEntity);
      expect(item.GSI3PK).toBe('hiyori#TOPICS#user1');
      expect(item.GSI3SK).toBe(3.5);
    });

    it('RequestText/RequestedAt を GSI3PK/GSI3SK に投影しない（甲-1）', () => {
      const item = mapper.toItem({
        ...baseEntity,
        RequestText: '最新アニメ情報を調べて',
        RequestedAt: 1_749_000_000_000,
      });
      expect(item.GSI3PK).toBe('hiyori#TOPICS#user1');
      expect(item.GSI3SK).toBe(3.5);
    });
  });

  describe('toEntity', () => {
    it('DynamoDB Item をエンティティに復元する', () => {
      const item = mapper.toItem(baseEntity);
      const entity = mapper.toEntity(item);
      expect(entity).toEqual(baseEntity);
    });

    it('Care 属性が無い場合は GSI3SK から復元する（GSI3 Query 結果向け）', () => {
      const item = mapper.toItem(baseEntity);
      delete (item as Record<string, unknown>).Care;
      const entity = mapper.toEntity(item);
      expect(entity.Care).toBe(3.5);
    });

    it('CanonicalSummary の空文字を許可する', () => {
      const item = mapper.toItem({ ...baseEntity, CanonicalSummary: '' });
      const entity = mapper.toEntity(item);
      expect(entity.CanonicalSummary).toBe('');
    });

    it('Embedding が数値配列でない場合は InvalidEntityDataError を投げる', () => {
      const item = mapper.toItem(baseEntity);
      (item as Record<string, unknown>).Embedding = ['not', 'numbers'];
      expect(() => mapper.toEntity(item)).toThrow(InvalidEntityDataError);
    });

    it('Embedding が配列でない場合は InvalidEntityDataError を投げる', () => {
      const item = mapper.toItem(baseEntity);
      delete (item as Record<string, unknown>).Embedding;
      expect(() => mapper.toEntity(item)).toThrow(InvalidEntityDataError);
    });

    it('必須フィールド欠落で InvalidEntityDataError を投げる', () => {
      const item = mapper.toItem(baseEntity);
      delete (item as Record<string, unknown>).Subject;
      expect(() => mapper.toEntity(item)).toThrow(InvalidEntityDataError);
    });

    it('RequestText/RequestedAt が設定されていれば往復する（甲-1: 依頼由来 provenance）', () => {
      const requestEntity: TopicEntity = {
        ...baseEntity,
        RequestText: '最新アニメ情報を調べて',
        RequestedAt: 1_749_000_000_000,
      };
      const item = mapper.toItem(requestEntity);
      const entity = mapper.toEntity(item);
      expect(entity).toEqual(requestEntity);
    });

    it('RequestText/RequestedAt 未設定時は item/entity に現れない', () => {
      const item = mapper.toItem(baseEntity);
      expect((item as Record<string, unknown>).RequestText).toBeUndefined();
      expect((item as Record<string, unknown>).RequestedAt).toBeUndefined();

      const entity = mapper.toEntity(item);
      expect(entity.RequestText).toBeUndefined();
      expect(entity.RequestedAt).toBeUndefined();
    });

    it('GSI3 の Query 結果（RequestText/RequestedAt が投影されない）でも Care が復元できる', () => {
      const requestEntity: TopicEntity = {
        ...baseEntity,
        RequestText: '最新アニメ情報を調べて',
        RequestedAt: 1_749_000_000_000,
      };
      const item = mapper.toItem(requestEntity);
      // GSI3 Query 結果を模して RequestText/RequestedAt を投影しない
      delete (item as Record<string, unknown>).RequestText;
      delete (item as Record<string, unknown>).RequestedAt;
      const entity = mapper.toEntity(item);
      expect(entity.RequestText).toBeUndefined();
      expect(entity.RequestedAt).toBeUndefined();
      expect(entity.Care).toBe(3.5);
    });
  });

  describe('buildKeys', () => {
    it('PK / SK を組み立てる', () => {
      const { pk, sk } = mapper.buildKeys({
        userId: 'user1',
        characterId: 'hiyori',
        topicId: 'TOPIC-001',
      });
      expect(pk).toBe('USER#user1');
      expect(sk).toBe('CHAR#hiyori#TOPIC#TOPIC-001#META');
    });
  });
});
