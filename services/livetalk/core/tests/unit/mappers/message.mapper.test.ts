import { MessageMapper } from '../../../src/mappers/message.mapper.js';
import type { MessageEntity } from '../../../src/entities/message.entity.js';
import type { DynamoDBItem } from '@nagiyu/aws';

describe('MessageMapper', () => {
  const mapper = new MessageMapper();
  const baseEntity: MessageEntity = {
    UserID: 'google-12345',
    CharacterID: 'hiyori',
    MessageID: '01J9Z000000000000000000001',
    Role: 'user',
    Text: 'こんにちは',
    CreatedAt: 1_700_000_000_000,
    UpdatedAt: 1_700_000_000_000,
  };

  it('buildKeys は PK=USER# / SK=CHAR#<charId>#MSG#<ulid> を返す', () => {
    expect(
      mapper.buildKeys({
        userId: 'google-12345',
        characterId: 'hiyori',
        messageId: '01J9Z',
      })
    ).toEqual({
      pk: 'USER#google-12345',
      sk: 'CHAR#hiyori#MSG#01J9Z',
    });
  });

  it('toItem は必須属性 + Type=Message を含む Item を返す', () => {
    const item = mapper.toItem(baseEntity);
    expect(item.PK).toBe('USER#google-12345');
    expect(item.SK).toBe('CHAR#hiyori#MSG#01J9Z000000000000000000001');
    expect(item.Type).toBe('Message');
    expect(item.Role).toBe('user');
    expect(item.Text).toBe('こんにちは');
    expect(item.AudioS3Key).toBeUndefined();
    expect(item.TokenCount).toBeUndefined();
    expect(item.LatencyMs).toBeUndefined();
    expect(item.MotionUsed).toBeUndefined();
  });

  it('toItem は optional 属性を持つときだけ書き出す', () => {
    const item = mapper.toItem({
      ...baseEntity,
      AudioS3Key: 'audio/abc.wav',
      TokenCount: 42,
      LatencyMs: 1234,
      MotionUsed: 'talking',
    });
    expect(item.AudioS3Key).toBe('audio/abc.wav');
    expect(item.TokenCount).toBe(42);
    expect(item.LatencyMs).toBe(1234);
    expect(item.MotionUsed).toBe('talking');
  });

  it('toEntity は item を Entity に戻す（ラウンドトリップ）', () => {
    const item = mapper.toItem(baseEntity);
    expect(mapper.toEntity(item)).toEqual(baseEntity);
  });

  it('toEntity は optional 属性も再現する', () => {
    const original: MessageEntity = {
      ...baseEntity,
      AudioS3Key: 'audio/abc.wav',
      TokenCount: 42,
      LatencyMs: 1234,
      MotionUsed: 'talking',
    };
    const item = mapper.toItem(original);
    expect(mapper.toEntity(item)).toEqual(original);
  });

  it('toEntity は Role が user/assistant 以外の場合エラーを投げる', () => {
    const item = mapper.toItem(baseEntity);
    const corrupted: DynamoDBItem = { ...item, Role: 'system' as unknown as string };
    expect(() => mapper.toEntity(corrupted)).toThrow(/Role/);
  });

  it('toEntity は Text が空文字でも許容する（モデルが空応答した場合の記録性質）', () => {
    const item = mapper.toItem({ ...baseEntity, Text: '' });
    expect(mapper.toEntity(item).Text).toBe('');
  });

  it('toEntity は CreatedAt が文字列でも互換変換する', () => {
    const item = mapper.toItem(baseEntity);
    const legacy = {
      ...item,
      CreatedAt: '2024-01-01T00:00:00Z' as unknown as number,
    };
    const entity = mapper.toEntity(legacy);
    expect(typeof entity.CreatedAt).toBe('number');
    expect(entity.CreatedAt).toBeGreaterThan(0);
  });
});
