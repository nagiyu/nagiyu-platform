import { NotificationEventMapper } from '../../../src/mappers/notification-event.mapper.js';
import { DEFAULT_CHARACTER_ID } from '../../../src/constants.js';

/**
 * NotificationEventMapper のユニットテスト。
 * Phase A (#3491): CharacterID の round-trip と欠落時の DEFAULT 補完を検証する。
 */
describe('NotificationEventMapper', () => {
  const mapper = new NotificationEventMapper();
  const fixedNow = 1_750_000_000_000;

  /** CharacterID 付きの完全なエンティティ */
  const fullEntity = {
    UserID: 'u1',
    NotifID: 'NOTIF-001',
    CharacterID: 'hiyori',
    Kind: 'normal' as const,
    Title: '桃瀬ひよりより',
    Body: 'ちょっと話したいことがあるんだけど、来てくれると嬉しいな',
    CreatedAt: fixedNow,
    Ttl: Math.floor(fixedNow / 1000) + 86400,
  };

  describe('buildKeys', () => {
    it('正しい PK/SK を生成する', () => {
      const { pk, sk } = mapper.buildKeys({ userId: 'u1', notifId: 'NOTIF-001' });
      expect(pk).toBe('USER#u1');
      expect(sk).toBe('NOTIF#NOTIF-001');
    });
  });

  describe('CharacterID の round-trip', () => {
    it('toItem / toEntity のラウンドトリップが成立する（hiyori）', () => {
      const item = mapper.toItem(fullEntity);
      const restored = mapper.toEntity(item);
      expect(restored.CharacterID).toBe('hiyori');
      expect(restored).toEqual(fullEntity);
    });

    it('ageha の CharacterID もラウンドトリップできる', () => {
      const agehaEntity = { ...fullEntity, CharacterID: 'ageha' };
      const item = mapper.toItem(agehaEntity);
      const restored = mapper.toEntity(item);
      expect(restored.CharacterID).toBe('ageha');
    });

    it('toItem に CharacterID が含まれる', () => {
      const item = mapper.toItem(fullEntity);
      expect(item.CharacterID).toBe('hiyori');
    });
  });

  describe('CharacterID 欠落時の後方互換（DEFAULT_CHARACTER_ID 補完）', () => {
    it('CharacterID が undefined の旧データは DEFAULT_CHARACTER_ID で補完される', () => {
      const legacyItem = {
        PK: 'USER#u1',
        SK: 'NOTIF#NOTIF-001',
        Type: 'NotificationEvent',
        UserID: 'u1',
        NotifID: 'NOTIF-001',
        // CharacterID は意図的に省略（旧データを模擬）
        Kind: 'normal',
        Title: '旧データのタイトル',
        Body: '旧データの本文',
        CreatedAt: fixedNow,
        UpdatedAt: fixedNow,
        Ttl: Math.floor(fixedNow / 1000) + 86400,
      };
      const restored = mapper.toEntity(legacyItem);
      expect(restored.CharacterID).toBe(DEFAULT_CHARACTER_ID);
    });

    it('DEFAULT_CHARACTER_ID は "hiyori" である', () => {
      expect(DEFAULT_CHARACTER_ID).toBe('hiyori');
    });
  });

  describe('オプショナルフィールド', () => {
    it('KnowledgeID と ConsumedAt のラウンドトリップが成立する', () => {
      const entityWithOptionals = {
        ...fullEntity,
        KnowledgeID: 'KNOWLEDGE-001',
        ConsumedAt: fixedNow + 5000,
      };
      const item = mapper.toItem(entityWithOptionals);
      const restored = mapper.toEntity(item);
      expect(restored.KnowledgeID).toBe('KNOWLEDGE-001');
      expect(restored.ConsumedAt).toBe(fixedNow + 5000);
    });

    it('KnowledgeID が undefined の場合は item に含まれない', () => {
      const item = mapper.toItem(fullEntity);
      expect(item.KnowledgeID).toBeUndefined();
    });

    it('ConsumedAt が undefined の場合は item に含まれない', () => {
      const item = mapper.toItem(fullEntity);
      expect(item.ConsumedAt).toBeUndefined();
    });
  });
});
