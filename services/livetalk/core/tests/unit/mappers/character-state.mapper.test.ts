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
    expect(mapper.toEntity(item)).toEqual(baseEntity);
  });

  it('Phase 3 以降で追加するフィールド（AffectionLevel / Onboarded）は保持しない', () => {
    const item = mapper.toItem(baseEntity);
    expect(item.AffectionLevel).toBeUndefined();
    expect(item.Onboarded).toBeUndefined();
  });
});
