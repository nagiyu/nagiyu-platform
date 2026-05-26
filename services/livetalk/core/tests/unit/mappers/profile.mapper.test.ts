import { ProfileMapper } from '../../../src/mappers/profile.mapper.js';
import type { ProfileEntity } from '../../../src/entities/profile.entity.js';

describe('ProfileMapper', () => {
  const mapper = new ProfileMapper();
  const baseEntity: ProfileEntity = {
    UserID: 'google-12345',
    LastActiveAt: 1_700_000_000_000,
    CreatedAt: 1_700_000_000_000,
    UpdatedAt: 1_700_000_000_000,
  };

  it('buildKeys は PK=USER# / SK=PROFILE を返す', () => {
    expect(mapper.buildKeys({ userId: 'google-12345' })).toEqual({
      pk: 'USER#google-12345',
      sk: 'PROFILE',
    });
  });

  it('toItem / toEntity は roundtrip する', () => {
    const item = mapper.toItem(baseEntity);
    expect(item.PK).toBe('USER#google-12345');
    expect(item.SK).toBe('PROFILE');
    expect(item.Type).toBe('Profile');
    expect(mapper.toEntity(item)).toEqual(baseEntity);
  });

  it('Auth 側の情報（DisplayName / Email / GoogleID）は永続化しない', () => {
    const item = mapper.toItem(baseEntity);
    expect(item.DisplayName).toBeUndefined();
    expect(item.Email).toBeUndefined();
    expect(item.GoogleID).toBeUndefined();
  });
});
