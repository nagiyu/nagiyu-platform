import { ProfileMapper } from '../../../src/mappers/profile.mapper.js';
import type { ProfileEntity } from '../../../src/entities/profile.entity.js';

describe('ProfileMapper', () => {
  const mapper = new ProfileMapper();
  const baseEntity: ProfileEntity = {
    UserID: 'google-12345',
    GoogleID: 'google-12345',
    DisplayName: '山田太郎',
    Email: 'taro@example.com',
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

  it('DisplayName / Email は空文字でも許容する', () => {
    const item = mapper.toItem({ ...baseEntity, DisplayName: '', Email: '' });
    const entity = mapper.toEntity(item);
    expect(entity.DisplayName).toBe('');
    expect(entity.Email).toBe('');
  });
});
