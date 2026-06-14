import { ProfileMapper } from '../../../src/mappers/profile.mapper.js';
import type { ProfileEntity, UserConsents } from '../../../src/entities/profile.entity.js';

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

  it('toItem に GSI1PK="PROFILE" が含まれる（sparse GSI）', () => {
    const item = mapper.toItem(baseEntity);
    expect(item.GSI1PK).toBe('PROFILE');
  });

  it('toItem に GSI1SK=UserID（生の UserID）が含まれる', () => {
    const item = mapper.toItem(baseEntity);
    expect(item.GSI1SK).toBe('google-12345');
  });

  it('toEntity は GSI1PK / GSI1SK を entity に含めない', () => {
    const item = mapper.toItem(baseEntity);
    const entity = mapper.toEntity(item);
    expect(Object.keys(entity)).not.toContain('GSI1PK');
    expect(Object.keys(entity)).not.toContain('GSI1SK');
  });

  it('Auth 側の情報（DisplayName / Email / GoogleID）は永続化しない', () => {
    const item = mapper.toItem(baseEntity);
    expect(item.DisplayName).toBeUndefined();
    expect(item.Email).toBeUndefined();
    expect(item.GoogleID).toBeUndefined();
  });

  it('Consents が undefined の場合 item に Consents キーを含まない', () => {
    const entity: ProfileEntity = { ...baseEntity, Consents: undefined };
    const item = mapper.toItem(entity);
    expect(item.Consents).toBeUndefined();
  });

  it('Consents がある場合 toItem / toEntity でラウンドトリップする', () => {
    const consents: UserConsents = {
      TermsAgreed: { Version: '1.0.0', AgreedAt: 1_700_000_000_001 },
      PrivacyAgreed: { Version: '1.0.0', AgreedAt: 1_700_000_000_002 },
      AgeVerified: { Value: true, VerifiedAt: 1_700_000_000_003 },
    };
    const entity: ProfileEntity = { ...baseEntity, Consents: consents };
    const item = mapper.toItem(entity);
    expect(mapper.toEntity(item)).toEqual(entity);
  });
});
