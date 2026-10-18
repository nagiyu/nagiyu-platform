/**
 * AccountDeletionRepository 契約テスト（実装非依存の振る舞い仕様）
 *
 * InMemory 実装と実 DynamoDB 実装（DynamoDB Local）の双方に同一の仕様を通し、
 * 削除の対象範囲・SafetyEvent の匿名化・冪等性が実装間でずれないことを検知する。
 */

import type { AccountDeletionRepository } from '../../src/repositories/account-deletion.repository.interface.js';
import type { ChatGuardRepository } from '../../src/repositories/chat-guard.repository.interface.js';

/** 保存済みアイテム（属性名 → 値） */
export type StoredItem = Record<string, unknown>;

/** 契約テストの対象実装が満たすべきフック */
export interface AccountDeletionRepositoryContractHooks {
  /** テスト対象を生成する（reset の後に呼ばれる）。ULID と現在時刻は固定値を注入する */
  makeRepositories: (options: { ulid: string; nowMs: number }) => Promise<{
    accountDeletion: AccountDeletionRepository;
    chatGuard: ChatGuardRepository;
  }>;
  /** アイテムを直接保存する（テストデータの準備用） */
  seed: (item: StoredItem) => Promise<void>;
  /** PK 配下の全アイテムを返す */
  listByPk: (pk: string) => Promise<StoredItem[]>;
  /** 各テスト前にストア／テーブルをクリーンな状態に戻す */
  reset: () => Promise<void>;
  /** 全テスト終了後の後始末（テーブル削除等） */
  teardown?: () => Promise<void>;
}

const NOW_MS = 1_700_000_000_000;
const ULID = 'TESTULIDVALUE01234567890';
const ANON_PK = `USER#ANON#${ULID}`;
const USER_ID = 'google-user-001';
const USER_PK = `USER#${USER_ID}`;

function profileItem(userId: string): StoredItem {
  return {
    PK: `USER#${userId}`,
    SK: 'PROFILE',
    Type: 'Profile',
    UserID: userId,
    CreatedAt: NOW_MS,
    UpdatedAt: NOW_MS,
  };
}

function messageItem(userId: string, index: number): StoredItem {
  return {
    PK: `USER#${userId}`,
    SK: `CHAR#hiyori#MSG#${String(index).padStart(4, '0')}`,
    Type: 'Message',
    UserID: userId,
    CreatedAt: NOW_MS,
    UpdatedAt: NOW_MS,
  };
}

function safetyItem(userId: string, eventId: string, overrides: StoredItem = {}): StoredItem {
  return {
    PK: `USER#${userId}`,
    SK: `SAFETY#${eventId}`,
    Type: 'SafetyEvent',
    UserID: userId,
    EventID: eventId,
    CharacterID: 'hiyori',
    Trigger: 'input_keyword',
    DetectedPattern: '[自殺念慮] 死にたい',
    InputText: '死にたい',
    ResponseText: '心配してるよ',
    // 未知の属性も匿名化後に保たれることを確かめるための属性
    FutureAttribute: 'kept',
    GSI2PK: 'SAFETY',
    GSI2SK: eventId,
    CreatedAt: NOW_MS - 1_000,
    UpdatedAt: NOW_MS - 1_000,
    ...overrides,
  };
}

/** SK 昇順に並べる（実装による返却順の差を比較に持ち込まない） */
function sortedBySk(items: StoredItem[]): StoredItem[] {
  return [...items].sort((a, b) => String(a['SK']).localeCompare(String(b['SK'])));
}

/**
 * AccountDeletionRepository の契約テストスイートを定義する。
 *
 * @param label - テスト対象実装のラベル（describe 名に使用）
 * @param hooks - テスト対象実装を操作するためのフック
 */
export function defineAccountDeletionRepositoryContract(
  label: string,
  hooks: AccountDeletionRepositoryContractHooks
): void {
  describe(`AccountDeletionRepository 契約: ${label}`, () => {
    let repository: AccountDeletionRepository;
    let chatGuard: ChatGuardRepository;

    beforeEach(async () => {
      await hooks.reset();
      const repositories = await hooks.makeRepositories({ ulid: ULID, nowMs: NOW_MS });
      repository = repositories.accountDeletion;
      chatGuard = repositories.chatGuard;
    });

    afterAll(async () => {
      if (hooks.teardown) {
        await hooks.teardown();
      }
    });

    it('アイテムがなければ 0 件で成功する', async () => {
      await expect(repository.deleteAccount(USER_ID)).resolves.toEqual({
        deletedCount: 0,
        anonymizedCount: 0,
      });
    });

    it('SafetyEvent 以外をすべて削除し、件数を返す', async () => {
      await hooks.seed(profileItem(USER_ID));
      await hooks.seed(messageItem(USER_ID, 1));
      await hooks.seed(messageItem(USER_ID, 2));

      const result = await repository.deleteAccount(USER_ID);

      expect(result).toEqual({ deletedCount: 3, anonymizedCount: 0 });
      expect(await hooks.listByPk(USER_PK)).toEqual([]);
    });

    it('チャットガードのカウンタとロックも削除対象になる', async () => {
      await chatGuard.incrementRateLimit(USER_ID, '1m', NOW_MS);
      await chatGuard.incrementRateLimit(USER_ID, '1h', NOW_MS);
      await chatGuard.acquireLock(USER_ID, 'token-a', 60_000, NOW_MS);

      const result = await repository.deleteAccount(USER_ID);

      expect(result).toEqual({ deletedCount: 3, anonymizedCount: 0 });
      expect(await hooks.listByPk(USER_PK)).toEqual([]);
      // 削除後はロックも取得し直せる
      const lock = await chatGuard.acquireLock(USER_ID, 'token-b', 60_000, NOW_MS + 1);
      expect(lock.acquired).toBe(true);
    });

    it('SafetyEvent は削除せず、匿名 PK へ移して個人識別子を切り離す', async () => {
      await hooks.seed(safetyItem(USER_ID, 'EVT001'));
      await hooks.seed(safetyItem(USER_ID, 'EVT002'));

      const result = await repository.deleteAccount(USER_ID);

      expect(result).toEqual({ deletedCount: 0, anonymizedCount: 2 });
      expect(await hooks.listByPk(USER_PK)).toEqual([]);

      const moved = sortedBySk(await hooks.listByPk(ANON_PK));
      expect(moved).toHaveLength(2);
      for (const [index, item] of moved.entries()) {
        const eventId = `EVT00${index + 1}`;
        expect(item).toEqual({
          ...safetyItem(USER_ID, eventId),
          PK: ANON_PK,
          UserID: `ANON#${ULID}`,
          GSI2PK: 'SAFETY',
          GSI2SK: eventId,
          UpdatedAt: NOW_MS,
          AnonymizedAt: new Date(NOW_MS).toISOString(),
        });
      }
    });

    it('GSI2SK を持たない旧形式の SafetyEvent は EventID で補って横断索引に残す', async () => {
      const legacy = safetyItem(USER_ID, 'EVT_LEGACY');
      delete legacy['GSI2PK'];
      delete legacy['GSI2SK'];
      await hooks.seed(legacy);

      await repository.deleteAccount(USER_ID);

      const [item] = await hooks.listByPk(ANON_PK);
      expect(item).toMatchObject({ GSI2PK: 'SAFETY', GSI2SK: 'EVT_LEGACY' });
    });

    it('他のユーザーのデータには触れない', async () => {
      await hooks.seed(profileItem(USER_ID));
      await hooks.seed(profileItem('other-user'));
      await hooks.seed(safetyItem('other-user', 'OTHER_EVT'));

      await repository.deleteAccount(USER_ID);

      expect(await hooks.listByPk('USER#other-user')).toHaveLength(2);
    });

    it('実行を重ねても同じ結果に収束する（冪等）', async () => {
      await hooks.seed(profileItem(USER_ID));
      await hooks.seed(safetyItem(USER_ID, 'EVT001'));

      await repository.deleteAccount(USER_ID);
      const second = await repository.deleteAccount(USER_ID);

      expect(second).toEqual({ deletedCount: 0, anonymizedCount: 0 });
      expect(await hooks.listByPk(ANON_PK)).toHaveLength(1);
    });

    it('1 ページに収まらない件数でも全件削除する', async () => {
      for (let i = 0; i < 130; i++) {
        await hooks.seed(messageItem(USER_ID, i));
      }

      const result = await repository.deleteAccount(USER_ID);

      expect(result).toEqual({ deletedCount: 130, anonymizedCount: 0 });
      expect(await hooks.listByPk(USER_PK)).toEqual([]);
    });
  });
}
