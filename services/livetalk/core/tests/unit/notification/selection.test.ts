import {
  selectNotificationsToSend,
  type SelectNotificationsInput,
} from '../../../src/notification/selection.js';
import type { NotificationEventEntity } from '../../../src/entities/notification-event.entity.js';

const NOW = new Date('2026-06-09T10:00:00.000Z');
const TODAY_START = (() => {
  const d = new Date(NOW);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
})();
const DAY = 24 * 60 * 60 * 1000;

/**
 * テスト用の NotificationEventEntity を生成するヘルパ。
 */
function makeEvent(
  kind: 'normal' | 'critical',
  createdAt: number,
  characterId = 'hiyori'
): NotificationEventEntity {
  return {
    UserID: 'u1',
    NotifID: `notif-${createdAt}-${characterId}`,
    CharacterID: characterId,
    Kind: kind,
    Title: 'テスト',
    Body: '本文',
    CreatedAt: createdAt,
    Ttl: Math.floor(createdAt / 1000) + 86400,
  };
}

/**
 * テスト用のベース入力を返す（候補なし・履歴なし）。
 */
function makeBaseInput(
  overrides: Partial<SelectNotificationsInput> = {}
): SelectNotificationsInput {
  return {
    criticalCandidates: [],
    normalCandidates: [],
    allUserEvents: [],
    now: NOW,
    userDailyNormalCap: 1,
    ...overrides,
  };
}

describe('selectNotificationsToSend', () => {
  describe('critical 候補の処理', () => {
    it('critical 候補が 1 件 → そのキャラが criticalCharacterIds に含まれる', () => {
      const result = selectNotificationsToSend(
        makeBaseInput({
          criticalCandidates: [{ characterId: 'hiyori' }],
        })
      );
      expect(result.criticalCharacterIds).toEqual(['hiyori']);
      expect(result.normalCharacterId).toBeNull();
    });

    it('critical 候補が複数 → 全件 criticalCharacterIds に含まれる', () => {
      const result = selectNotificationsToSend(
        makeBaseInput({
          criticalCandidates: [{ characterId: 'hiyori' }, { characterId: 'ageha' }],
        })
      );
      expect(result.criticalCharacterIds).toEqual(['hiyori', 'ageha']);
    });

    it('候補がない場合 → criticalCharacterIds は空配列', () => {
      const result = selectNotificationsToSend(makeBaseInput());
      expect(result.criticalCharacterIds).toEqual([]);
    });
  });

  describe('normal 候補の処理: 上限チェック', () => {
    it('本日の normal 件数が cap 未満 → 候補から 1 体選抜される', () => {
      const result = selectNotificationsToSend(
        makeBaseInput({
          normalCandidates: [{ characterId: 'hiyori', lastNormalAt: 0 }],
          allUserEvents: [],
          userDailyNormalCap: 1,
        })
      );
      expect(result.normalCharacterId).toBe('hiyori');
    });

    it('本日の normal 件数が cap と同値 → null（上限到達）', () => {
      const result = selectNotificationsToSend(
        makeBaseInput({
          normalCandidates: [{ characterId: 'hiyori', lastNormalAt: 0 }],
          // 本日 normal 1 件送信済み
          allUserEvents: [makeEvent('normal', TODAY_START + 1000)],
          userDailyNormalCap: 1,
        })
      );
      expect(result.normalCharacterId).toBeNull();
    });

    it('本日の normal 件数が cap を超えている → null', () => {
      const result = selectNotificationsToSend(
        makeBaseInput({
          normalCandidates: [{ characterId: 'hiyori', lastNormalAt: 0 }],
          allUserEvents: [
            makeEvent('normal', TODAY_START + 1000),
            makeEvent('normal', TODAY_START + 2000),
          ],
          userDailyNormalCap: 1,
        })
      );
      expect(result.normalCharacterId).toBeNull();
    });

    it('cap=2 のとき本日 normal 1 件 → まだ選抜できる', () => {
      const result = selectNotificationsToSend(
        makeBaseInput({
          normalCandidates: [{ characterId: 'hiyori', lastNormalAt: 0 }],
          allUserEvents: [makeEvent('normal', TODAY_START + 1000)],
          userDailyNormalCap: 2,
        })
      );
      expect(result.normalCharacterId).toBe('hiyori');
    });

    it('normal 候補がない → null', () => {
      const result = selectNotificationsToSend(
        makeBaseInput({
          normalCandidates: [],
          userDailyNormalCap: 1,
        })
      );
      expect(result.normalCharacterId).toBeNull();
    });
  });

  describe('normal 候補の処理: 公平性選抜（lastNormalAt が最小のキャラを優先）', () => {
    it('lastNormalAt=0（未通知）のキャラが最優先', () => {
      const result = selectNotificationsToSend(
        makeBaseInput({
          normalCandidates: [
            { characterId: 'ageha', lastNormalAt: NOW.getTime() - DAY }, // 昨日通知済み
            { characterId: 'hiyori', lastNormalAt: 0 }, // 未通知
          ],
          userDailyNormalCap: 1,
        })
      );
      // 未通知（=0）のひよりが選ばれる
      expect(result.normalCharacterId).toBe('hiyori');
    });

    it('両キャラ未通知（lastNormalAt=0 同値）→ characterId 昇順で安定選択', () => {
      const result = selectNotificationsToSend(
        makeBaseInput({
          normalCandidates: [
            { characterId: 'hiyori', lastNormalAt: 0 },
            { characterId: 'ageha', lastNormalAt: 0 },
          ],
          userDailyNormalCap: 1,
        })
      );
      // 'ageha' < 'hiyori' → ageha が選ばれる
      expect(result.normalCharacterId).toBe('ageha');
    });

    it('lastNormalAt の小さいほうが選ばれる', () => {
      const result = selectNotificationsToSend(
        makeBaseInput({
          normalCandidates: [
            { characterId: 'hiyori', lastNormalAt: NOW.getTime() - 2 * DAY }, // 2日前
            { characterId: 'ageha', lastNormalAt: NOW.getTime() - DAY }, // 1日前
          ],
          userDailyNormalCap: 1,
        })
      );
      // 2日前（より古い）のひよりが選ばれる
      expect(result.normalCharacterId).toBe('hiyori');
    });

    it('3 体以上: lastNormalAt が最小のものが選ばれる', () => {
      const result = selectNotificationsToSend(
        makeBaseInput({
          normalCandidates: [
            { characterId: 'hiyori', lastNormalAt: NOW.getTime() - DAY },
            { characterId: 'ageha', lastNormalAt: NOW.getTime() - 3 * DAY }, // 最も古い
            { characterId: 'zeta', lastNormalAt: NOW.getTime() - 2 * DAY },
          ],
          userDailyNormalCap: 1,
        })
      );
      expect(result.normalCharacterId).toBe('ageha');
    });

    it('同値が複数ある場合は characterId 昇順で安定選択', () => {
      const ts = NOW.getTime() - DAY;
      const result = selectNotificationsToSend(
        makeBaseInput({
          normalCandidates: [
            { characterId: 'zeta', lastNormalAt: ts },
            { characterId: 'ageha', lastNormalAt: ts }, // 同値・昇順で ageha が先
            { characterId: 'hiyori', lastNormalAt: ts },
          ],
          userDailyNormalCap: 1,
        })
      );
      // 'ageha' < 'hiyori' < 'zeta' → ageha が選ばれる
      expect(result.normalCharacterId).toBe('ageha');
    });
  });

  describe('critial と normal の組み合わせ', () => {
    it('critical あり・normal あり → 両方返す', () => {
      const result = selectNotificationsToSend(
        makeBaseInput({
          criticalCandidates: [{ characterId: 'ageha' }],
          normalCandidates: [{ characterId: 'hiyori', lastNormalAt: 0 }],
          userDailyNormalCap: 1,
        })
      );
      expect(result.criticalCharacterIds).toEqual(['ageha']);
      expect(result.normalCharacterId).toBe('hiyori');
    });

    it('critical あり・normal 上限到達 → critical のみ返す', () => {
      const result = selectNotificationsToSend(
        makeBaseInput({
          criticalCandidates: [{ characterId: 'ageha' }],
          normalCandidates: [{ characterId: 'hiyori', lastNormalAt: 0 }],
          allUserEvents: [makeEvent('normal', TODAY_START + 1000)],
          userDailyNormalCap: 1,
        })
      );
      expect(result.criticalCharacterIds).toEqual(['ageha']);
      expect(result.normalCharacterId).toBeNull();
    });

    it('critical の daily cap 判定には allUserEvents を使わない（critical はキャラ独立）', () => {
      // critical cap の判定は decision 側で行うため、ここでは全候補を返す
      const result = selectNotificationsToSend(
        makeBaseInput({
          criticalCandidates: [{ characterId: 'hiyori' }, { characterId: 'ageha' }],
          allUserEvents: [
            makeEvent('critical', TODAY_START + 1000, 'hiyori'),
            makeEvent('critical', TODAY_START + 2000, 'ageha'),
          ],
          userDailyNormalCap: 1,
        })
      );
      // 調停関数は critical を全件返す（cap チェックは decision 側で行い済みの前提）
      expect(result.criticalCharacterIds).toHaveLength(2);
    });
  });

  describe('昨日の通知は daily cap に影響しない', () => {
    it('昨日の normal 1 件 → 本日 0 件なので選抜される', () => {
      const result = selectNotificationsToSend(
        makeBaseInput({
          normalCandidates: [{ characterId: 'hiyori', lastNormalAt: 0 }],
          // 昨日の通知
          allUserEvents: [makeEvent('normal', TODAY_START - 1000)],
          userDailyNormalCap: 1,
        })
      );
      expect(result.normalCharacterId).toBe('hiyori');
    });
  });
});
