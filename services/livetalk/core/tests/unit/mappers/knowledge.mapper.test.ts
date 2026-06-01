import { KnowledgeMapper } from '../../../src/mappers/knowledge.mapper.js';

describe('KnowledgeMapper', () => {
  const mapper = new KnowledgeMapper();

  const entity = {
    UserID: 'u1',
    CharacterID: 'hiyori',
    KnowledgeID: 'ulid-001',
    Topic: 'テスト',
    Summary: 'テスト要約',
    SourceUrls: ['https://example.com'],
    RawComment: 'コメント',
    RelatedCategory: 'テスト',
    CreatedAt: 1_700_000_000_000,
    UpdatedAt: 1_700_000_000_000,
  };

  it('buildKeys は正しい PK/SK を生成する', () => {
    const { pk, sk } = mapper.buildKeys({
      userId: 'u1',
      characterId: 'hiyori',
      knowledgeId: 'ulid-001',
    });
    expect(pk).toBe('USER#u1');
    expect(sk).toBe('CHAR#hiyori#KNOWLEDGE#ulid-001');
  });

  it('toItem / toEntity のラウンドトリップが成立する', () => {
    const item = mapper.toItem(entity);
    const restored = mapper.toEntity(item);
    expect(restored).toEqual(entity);
  });

  it('Ttl が undefined の場合は item に含まれない', () => {
    const item = mapper.toItem(entity);
    expect(item.Ttl).toBeUndefined();
  });

  it('Ttl が設定されている場合は item に含まれる', () => {
    const withTtl = { ...entity, Ttl: 9999 };
    const item = mapper.toItem(withTtl);
    const restored = mapper.toEntity(item);
    expect(item.Ttl).toBe(9999);
    expect(restored.Ttl).toBe(9999);
  });
});
