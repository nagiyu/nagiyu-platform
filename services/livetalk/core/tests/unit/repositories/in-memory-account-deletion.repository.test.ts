/**
 * InMemoryAccountDeletionRepository のユニットテスト（退会・データ削除 / Issue #3579）。
 *
 * ユーザーの混在アイテム（Profile / Message / Memory / Note 等）と SafetyEvent を seed し、
 * deleteAccount 後の状態が仕様通りかを検証する。
 *
 * テスト観点:
 * - 非 SafetyEvent（Profile / Message 等）が削除される
 * - SafetyEvent が `USER#ANON#…` PK へ移動される
 * - 移動後の SafetyEvent に同一匿名トークンが付与される
 * - UserID が匿名トークンに置換される（googleId を含まない）
 * - InputText / ResponseText / EventID / CharacterID が保持される（証跡）
 * - GSI2PK が維持される（横断 Query に残る）
 * - GSI2SK（EventID）が維持される
 * - AnonymizedAt / UpdatedAt が付与される
 * - 複数 SafetyEvent に同一匿名トークンが付与される
 * - deletedCount / anonymizedCount のカウント
 * - 空 PK での冪等（0件）
 * - SafetyEvent のみの場合（バッチ削除が呼ばれない）
 * - 100件超でもカーソルループで全件処理する
 */

import { InMemorySingleTableStore } from '@nagiyu/aws';
import { InMemoryAccountDeletionRepository } from '../../../src/repositories/in-memory-account-deletion.repository.js';

const FIXED_NOW = 1_700_000_000_000;
const FIXED_ULID = 'TESTULIDVALUE01234567890';
const ANON_TOKEN = `ANON#${FIXED_ULID}`;
const USER_ID = 'google-user-001';
const USER_PK = `USER#${USER_ID}`;

function makeRepo(store = new InMemorySingleTableStore()) {
  const repo = new InMemoryAccountDeletionRepository(
    store,
    () => FIXED_ULID,
    () => FIXED_NOW
  );
  return { repo, store };
}

/** 典型的な Profile アイテム（非 SafetyEvent） */
function seedProfile(store: InMemorySingleTableStore, userId: string) {
  store.put({
    PK: `USER#${userId}`,
    SK: 'PROFILE',
    Type: 'Profile',
    UserID: userId,
    DisplayName: 'テストユーザー',
    CreatedAt: FIXED_NOW,
    UpdatedAt: FIXED_NOW,
  });
}

/** 典型的な Message アイテム（非 SafetyEvent） */
function seedMessage(store: InMemorySingleTableStore, userId: string, msgId: string) {
  store.put({
    PK: `USER#${userId}`,
    SK: `CHAR#hiyori#MSG#${msgId}`,
    Type: 'Message',
    UserID: userId,
    MessageID: msgId,
    Text: 'テストメッセージ',
    CreatedAt: FIXED_NOW,
    UpdatedAt: FIXED_NOW,
  });
}

/** SafetyEvent アイテム */
function seedSafetyEvent(
  store: InMemorySingleTableStore,
  userId: string,
  eventId: string,
  opts?: { characterId?: string; moderationCategories?: string }
) {
  store.put({
    PK: `USER#${userId}`,
    SK: `SAFETY#${eventId}`,
    Type: 'SafetyEvent',
    UserID: userId,
    EventID: eventId,
    CharacterID: opts?.characterId ?? 'hiyori',
    Trigger: 'input_keyword',
    DetectedPattern: '[自殺念慮] 死にたい',
    InputText: '死にたい',
    ResponseText: '心配してるよ',
    GSI2PK: 'SAFETY',
    GSI2SK: eventId,
    CreatedAt: FIXED_NOW,
    UpdatedAt: FIXED_NOW,
    ...(opts?.moderationCategories
      ? { ModerationCategories: opts.moderationCategories }
      : {}),
  });
}

describe('InMemoryAccountDeletionRepository', () => {
  describe('空の PK の冪等動作', () => {
    it('アイテムが 0 件のとき { deletedCount: 0, anonymizedCount: 0 } を返す', async () => {
      const { repo } = makeRepo();
      const result = await repo.deleteAccount(USER_ID);
      expect(result).toEqual({ deletedCount: 0, anonymizedCount: 0 });
    });
  });

  describe('非 SafetyEvent の削除', () => {
    it('Profile と Message が削除される', async () => {
      const store = new InMemorySingleTableStore();
      const { repo } = makeRepo(store);

      seedProfile(store, USER_ID);
      seedMessage(store, USER_ID, 'MSG001');

      expect(store.get(USER_PK, 'PROFILE')).toBeDefined();
      expect(store.get(USER_PK, 'CHAR#hiyori#MSG#MSG001')).toBeDefined();

      const result = await repo.deleteAccount(USER_ID);

      expect(result.deletedCount).toBe(2);
      expect(result.anonymizedCount).toBe(0);
      // 削除されていること
      expect(store.get(USER_PK, 'PROFILE')).toBeUndefined();
      expect(store.get(USER_PK, 'CHAR#hiyori#MSG#MSG001')).toBeUndefined();
    });

    it('SafetyEvent のみの場合（非SafetyEvent の削除は 0件）', async () => {
      const store = new InMemorySingleTableStore();
      const { repo } = makeRepo(store);

      seedSafetyEvent(store, USER_ID, 'EVT001');

      const result = await repo.deleteAccount(USER_ID);

      expect(result.deletedCount).toBe(0);
      expect(result.anonymizedCount).toBe(1);
      // 元の PK に SafetyEvent が残っていないこと
      expect(store.get(USER_PK, 'SAFETY#EVT001')).toBeUndefined();
      // 匿名化された新 PK に移動していること
      const newPk = `USER#${ANON_TOKEN}`;
      expect(store.get(newPk, 'SAFETY#EVT001')).toBeDefined();
    });
  });

  describe('SafetyEvent の匿名化と re-key', () => {
    it('SafetyEvent が USER#ANON#<ulid> PK へ移動する', async () => {
      const store = new InMemorySingleTableStore();
      const { repo } = makeRepo(store);

      seedSafetyEvent(store, USER_ID, 'EVT001');

      await repo.deleteAccount(USER_ID);

      const newPk = `USER#${ANON_TOKEN}`;
      const movedItem = store.get(newPk, 'SAFETY#EVT001');
      expect(movedItem).toBeDefined();
      expect(movedItem!.PK).toBe(newPk);
      expect(movedItem!.SK).toBe('SAFETY#EVT001');
    });

    it('UserID が匿名トークンに置換される（googleId を含まない）', async () => {
      const store = new InMemorySingleTableStore();
      const { repo } = makeRepo(store);

      seedSafetyEvent(store, USER_ID, 'EVT001');

      await repo.deleteAccount(USER_ID);

      const newPk = `USER#${ANON_TOKEN}`;
      const movedItem = store.get(newPk, 'SAFETY#EVT001');
      expect(movedItem!.UserID).toBe(ANON_TOKEN);
      expect(String(movedItem!.UserID)).not.toContain(USER_ID);
    });

    it('InputText / ResponseText / EventID が保持される（証跡）', async () => {
      const store = new InMemorySingleTableStore();
      const { repo } = makeRepo(store);

      seedSafetyEvent(store, USER_ID, 'EVT001');

      await repo.deleteAccount(USER_ID);

      const newPk = `USER#${ANON_TOKEN}`;
      const movedItem = store.get(newPk, 'SAFETY#EVT001');
      expect(movedItem!.InputText).toBe('死にたい');
      expect(movedItem!.ResponseText).toBe('心配してるよ');
      expect(movedItem!.EventID).toBe('EVT001');
    });

    it('CharacterID が保持される', async () => {
      const store = new InMemorySingleTableStore();
      const { repo } = makeRepo(store);

      seedSafetyEvent(store, USER_ID, 'EVT001', { characterId: 'ageha' });

      await repo.deleteAccount(USER_ID);

      const newPk = `USER#${ANON_TOKEN}`;
      const movedItem = store.get(newPk, 'SAFETY#EVT001');
      expect(movedItem!.CharacterID).toBe('ageha');
    });

    it('ModerationCategories が保持される', async () => {
      const store = new InMemorySingleTableStore();
      const { repo } = makeRepo(store);

      seedSafetyEvent(store, USER_ID, 'EVT001', {
        moderationCategories: '{"self-harm": true}',
      });

      await repo.deleteAccount(USER_ID);

      const newPk = `USER#${ANON_TOKEN}`;
      const movedItem = store.get(newPk, 'SAFETY#EVT001');
      expect(movedItem!.ModerationCategories).toBe('{"self-harm": true}');
    });

    it('GSI2PK が維持される（横断 Query に残る）', async () => {
      const store = new InMemorySingleTableStore();
      const { repo } = makeRepo(store);

      seedSafetyEvent(store, USER_ID, 'EVT001');

      await repo.deleteAccount(USER_ID);

      const newPk = `USER#${ANON_TOKEN}`;
      const movedItem = store.get(newPk, 'SAFETY#EVT001');
      expect(movedItem!.GSI2PK).toBe('SAFETY');
    });

    it('GSI2SK（EventID）が維持される', async () => {
      const store = new InMemorySingleTableStore();
      const { repo } = makeRepo(store);

      seedSafetyEvent(store, USER_ID, 'EVT001');

      await repo.deleteAccount(USER_ID);

      const newPk = `USER#${ANON_TOKEN}`;
      const movedItem = store.get(newPk, 'SAFETY#EVT001');
      expect(movedItem!.GSI2SK).toBe('EVT001');
    });

    it('AnonymizedAt と UpdatedAt が付与される', async () => {
      const store = new InMemorySingleTableStore();
      const { repo } = makeRepo(store);

      seedSafetyEvent(store, USER_ID, 'EVT001');

      await repo.deleteAccount(USER_ID);

      const newPk = `USER#${ANON_TOKEN}`;
      const movedItem = store.get(newPk, 'SAFETY#EVT001');
      expect(movedItem!.AnonymizedAt).toBe(new Date(FIXED_NOW).toISOString());
      expect(movedItem!.UpdatedAt).toBe(FIXED_NOW);
    });

    it('Type が SafetyEvent のまま維持される', async () => {
      const store = new InMemorySingleTableStore();
      const { repo } = makeRepo(store);

      seedSafetyEvent(store, USER_ID, 'EVT001');

      await repo.deleteAccount(USER_ID);

      const newPk = `USER#${ANON_TOKEN}`;
      const movedItem = store.get(newPk, 'SAFETY#EVT001');
      expect(movedItem!.Type).toBe('SafetyEvent');
    });

    it('複数の SafetyEvent に同じ匿名トークンが付与される', async () => {
      const store = new InMemorySingleTableStore();
      const { repo } = makeRepo(store);

      seedSafetyEvent(store, USER_ID, 'EVT001');
      seedSafetyEvent(store, USER_ID, 'EVT002');
      seedSafetyEvent(store, USER_ID, 'EVT003');

      const result = await repo.deleteAccount(USER_ID);

      expect(result.anonymizedCount).toBe(3);

      const newPk = `USER#${ANON_TOKEN}`;
      const item1 = store.get(newPk, 'SAFETY#EVT001');
      const item2 = store.get(newPk, 'SAFETY#EVT002');
      const item3 = store.get(newPk, 'SAFETY#EVT003');

      expect(item1).toBeDefined();
      expect(item2).toBeDefined();
      expect(item3).toBeDefined();
      // 全て同じ匿名トークン
      expect(item1!.UserID).toBe(ANON_TOKEN);
      expect(item2!.UserID).toBe(ANON_TOKEN);
      expect(item3!.UserID).toBe(ANON_TOKEN);
    });

    it('元の PK から SafetyEvent が削除される', async () => {
      const store = new InMemorySingleTableStore();
      const { repo } = makeRepo(store);

      seedSafetyEvent(store, USER_ID, 'EVT001');

      await repo.deleteAccount(USER_ID);

      // 元の PK にアイテムが残っていないこと
      expect(store.get(USER_PK, 'SAFETY#EVT001')).toBeUndefined();
    });
  });

  describe('混在アイテムの統合テスト', () => {
    it('Profile + Message + SafetyEvent × 2 の混在シナリオ', async () => {
      const store = new InMemorySingleTableStore();
      const { repo } = makeRepo(store);

      seedProfile(store, USER_ID);
      seedMessage(store, USER_ID, 'MSG001');
      seedMessage(store, USER_ID, 'MSG002');
      seedSafetyEvent(store, USER_ID, 'EVT001');
      seedSafetyEvent(store, USER_ID, 'EVT002');

      const result = await repo.deleteAccount(USER_ID);

      expect(result.deletedCount).toBe(3); // Profile + Message × 2
      expect(result.anonymizedCount).toBe(2); // SafetyEvent × 2

      // 非 SafetyEvent が削除されていること
      expect(store.get(USER_PK, 'PROFILE')).toBeUndefined();
      expect(store.get(USER_PK, 'CHAR#hiyori#MSG#MSG001')).toBeUndefined();
      expect(store.get(USER_PK, 'CHAR#hiyori#MSG#MSG002')).toBeUndefined();

      // SafetyEvent が新 PK に移動していること
      const newPk = `USER#${ANON_TOKEN}`;
      expect(store.get(newPk, 'SAFETY#EVT001')).toBeDefined();
      expect(store.get(newPk, 'SAFETY#EVT002')).toBeDefined();
    });

    it('別ユーザーのデータは影響を受けない', async () => {
      const store = new InMemorySingleTableStore();
      const { repo } = makeRepo(store);

      // 対象ユーザー
      seedProfile(store, USER_ID);
      seedSafetyEvent(store, USER_ID, 'EVT001');

      // 別ユーザー
      const otherUserId = 'google-other-user';
      seedProfile(store, otherUserId);
      seedSafetyEvent(store, otherUserId, 'OTHER_EVT001');

      await repo.deleteAccount(USER_ID);

      // 別ユーザーのデータが残っていること
      const otherPk = `USER#${otherUserId}`;
      expect(store.get(otherPk, 'PROFILE')).toBeDefined();
      expect(store.get(otherPk, 'SAFETY#OTHER_EVT001')).toBeDefined();
    });
  });

  describe('カーソルループ（100件超）', () => {
    it('100件超の非 SafetyEvent を全件削除する', async () => {
      const store = new InMemorySingleTableStore();
      const { repo } = makeRepo(store);

      // 110件の Message アイテムを seed する
      const total = 110;
      for (let i = 0; i < total; i++) {
        store.put({
          PK: USER_PK,
          SK: `CHAR#hiyori#MSG#${String(i).padStart(4, '0')}`,
          Type: 'Message',
          UserID: USER_ID,
          CreatedAt: FIXED_NOW,
          UpdatedAt: FIXED_NOW,
        });
      }

      // 初期状態の確認
      expect(store.size()).toBe(total);

      const result = await repo.deleteAccount(USER_ID);

      expect(result.deletedCount).toBe(total);
      expect(result.anonymizedCount).toBe(0);
      // 全件削除されていること
      expect(store.size()).toBe(0);
    });
  });
});
