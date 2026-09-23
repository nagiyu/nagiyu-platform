import { InvalidEntityDataError } from '@nagiyu/aws';
import { SelfFactMapper } from '../../../src/mappers/self-fact.mapper.js';
import type { SelfFactEntity } from '../../../src/entities/self-fact.entity.js';

const baseEntity: SelfFactEntity = {
  UserID: 'user1',
  CharacterID: 'hiyori',
  TopicID: 'TOPIC-001',
  FactID: 'FACT-001',
  Text: 'ユーザーはコーヒーが好き',
  Provenance: 'MSG-123 から抽出',
  CreatedAt: 1_750_000_000_000,
};

describe('SelfFactMapper', () => {
  let mapper: SelfFactMapper;

  beforeEach(() => {
    mapper = new SelfFactMapper();
  });

  describe('toItem', () => {
    it('エンティティを DynamoDB Item に変換する', () => {
      const item = mapper.toItem(baseEntity);
      expect(item.PK).toBe('USER#user1');
      expect(item.SK).toBe('CHAR#hiyori#TOPIC#TOPIC-001#SELF#FACT-001');
      expect(item.Type).toBe('SelfFact');
      expect(item.Text).toBe('ユーザーはコーヒーが好き');
      expect(item.Provenance).toBe('MSG-123 から抽出');
    });

    it('GSI3PK/GSI3SK を付与しない（sparse GSI-TOPIC は META のみ）', () => {
      const item = mapper.toItem(baseEntity);
      expect(item.GSI3PK).toBeUndefined();
      expect(item.GSI3SK).toBeUndefined();
    });
  });

  describe('toEntity', () => {
    it('DynamoDB Item をエンティティに復元する', () => {
      const item = mapper.toItem(baseEntity);
      const entity = mapper.toEntity(item);
      expect(entity).toEqual(baseEntity);
    });

    it('Provenance の空文字を許可する（出所不明時）', () => {
      const item = mapper.toItem({ ...baseEntity, Provenance: '' });
      const entity = mapper.toEntity(item);
      expect(entity.Provenance).toBe('');
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
      expect(sk).toBe('CHAR#hiyori#TOPIC#TOPIC-001#SELF#FACT-001');
    });
  });
});
