import { LifecycleMapper } from '../../../src/mappers/lifecycle.mapper.js';
import type { LifecycleEntity } from '../../../src/entities/lifecycle.entity.js';

describe('LifecycleMapper', () => {
  const mapper = new LifecycleMapper();
  const baseEntity: LifecycleEntity = {
    UserID: 'google-12345',
    CharacterID: 'hiyori',
    Bedtime: '01:30',
    WakeUpTime: '09:30',
    CreatedAt: 1_700_000_000_000,
    UpdatedAt: 1_700_000_000_000,
  };

  it('buildKeys は PK=USER# / SK=CHAR#<charId>#LIFECYCLE を返す', () => {
    expect(mapper.buildKeys({ userId: 'google-12345', characterId: 'hiyori' })).toEqual({
      pk: 'USER#google-12345',
      sk: 'CHAR#hiyori#LIFECYCLE',
    });
  });

  it('toItem / toEntity は roundtrip する（UserActivityProfile なし）', () => {
    const item = mapper.toItem(baseEntity);
    expect(item.PK).toBe('USER#google-12345');
    expect(item.SK).toBe('CHAR#hiyori#LIFECYCLE');
    expect(item.Type).toBe('Lifecycle');
    expect(item.Bedtime).toBe('01:30');
    expect(item.WakeUpTime).toBe('09:30');
    expect(item.UserActivityProfile).toBeUndefined();
    expect(mapper.toEntity(item)).toEqual(baseEntity);
  });

  it('UserActivityProfile を含む entity が roundtrip する', () => {
    const entityWithProfile: LifecycleEntity = {
      ...baseEntity,
      UserActivityProfile: {
        morningPeak: '08:00',
        eveningPeak: '21:00',
        sampleSize: 42,
        lastLearnedAt: '2026-06-01T00:00:00.000Z',
      },
    };
    const item = mapper.toItem(entityWithProfile);
    expect(item.UserActivityProfile).toEqual({
      morningPeak: '08:00',
      eveningPeak: '21:00',
      sampleSize: 42,
      lastLearnedAt: '2026-06-01T00:00:00.000Z',
    });
    const restored = mapper.toEntity(item);
    expect(restored).toEqual(entityWithProfile);
  });

  it('DynamoDB に UserActivityProfile がない場合は entity に含まれない', () => {
    const item = mapper.toItem(baseEntity);
    const entity = mapper.toEntity(item);
    expect(entity.UserActivityProfile).toBeUndefined();
  });

  it('entityType は "Lifecycle"', () => {
    expect(mapper.entityType).toBe('Lifecycle');
  });
});
