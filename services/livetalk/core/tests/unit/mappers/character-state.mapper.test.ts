import { CharacterStateMapper } from '../../../src/mappers/character-state.mapper.js';
import type { CharacterStateEntity } from '../../../src/entities/character-state.entity.js';

describe('CharacterStateMapper', () => {
  const mapper = new CharacterStateMapper();
  const baseEntity: CharacterStateEntity = {
    UserID: 'google-12345',
    CharacterID: 'hiyori',
    LastInteractionAt: 1_700_000_000_000,
    CreatedAt: 1_700_000_000_000,
    UpdatedAt: 1_700_000_000_000,
  };

  it('buildKeys は PK=USER# / SK=CHAR#<charId>#STATE を返す', () => {
    expect(mapper.buildKeys({ userId: 'google-12345', characterId: 'hiyori' })).toEqual({
      pk: 'USER#google-12345',
      sk: 'CHAR#hiyori#STATE',
    });
  });

  it('toItem / toEntity は roundtrip する', () => {
    const item = mapper.toItem(baseEntity);
    expect(item.PK).toBe('USER#google-12345');
    expect(item.SK).toBe('CHAR#hiyori#STATE');
    expect(item.Type).toBe('CharacterState');
    // AffectionLevel は省略時に 0 が補完されるため期待値にも追加
    expect(mapper.toEntity(item)).toEqual({ ...baseEntity, AffectionLevel: 0 });
  });

  it('AffectionLevel を含む entity は roundtrip する', () => {
    const entityWithAffection: CharacterStateEntity = { ...baseEntity, AffectionLevel: 3.5 };
    const item = mapper.toItem(entityWithAffection);
    expect(item.AffectionLevel).toBe(3.5);
    expect(mapper.toEntity(item).AffectionLevel).toBeCloseTo(3.5);
  });

  it('AffectionLevel 省略時は toItem で 0 になる', () => {
    const item = mapper.toItem(baseEntity);
    expect(item.AffectionLevel).toBe(0);
  });

  it('DynamoDB Item に AffectionLevel がない場合は toEntity で 0 になる', () => {
    const item = mapper.toItem(baseEntity);
    delete (item as Record<string, unknown>).AffectionLevel;
    expect(mapper.toEntity(item).AffectionLevel).toBe(0);
  });

  it('Onboarded など未定義フィールドは保持しない', () => {
    const item = mapper.toItem(baseEntity);
    expect(item.Onboarded).toBeUndefined();
  });
});
