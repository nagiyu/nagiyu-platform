/**
 * ChatGuardRepository 契約テスト（実装非依存の振る舞い仕様）
 *
 * InMemory 実装と実 DynamoDB 実装（DynamoDB Local）の双方に同一の仕様を通し、
 * カウンタの加算・ロックの取得と解放の条件が実装間でずれないことを検知する。
 */

import type { ChatGuardRepository } from '../../src/repositories/chat-guard.repository.interface.js';

/** 契約テストの対象実装が満たすべきフック */
export interface ChatGuardRepositoryContractHooks {
  /** テスト対象のリポジトリを生成する（reset の後に呼ばれる） */
  makeRepository: () => Promise<ChatGuardRepository>;
  /** 各テスト前にストア／テーブルをクリーンな状態に戻す */
  reset: () => Promise<void>;
  /** 全テスト終了後の後始末（テーブル削除等） */
  teardown?: () => Promise<void>;
}

// 分・時間の開始直後に置き、境界値テストが同じバケットに収まるようにする
const HOUR_START_MS = 473_696 * 3_600_000;
const NOW_MS = HOUR_START_MS + 1_000;
const LOCK_TTL_MS = 120_000;

/**
 * ChatGuardRepository の契約テストスイートを定義する。
 *
 * @param label - テスト対象実装のラベル（describe 名に使用）
 * @param hooks - テスト対象実装を操作するためのフック
 */
export function defineChatGuardRepositoryContract(
  label: string,
  hooks: ChatGuardRepositoryContractHooks
): void {
  describe(`ChatGuardRepository 契約: ${label}`, () => {
    let repository: ChatGuardRepository;

    beforeEach(async () => {
      await hooks.reset();
      repository = await hooks.makeRepository();
    });

    afterAll(async () => {
      if (hooks.teardown) {
        await hooks.teardown();
      }
    });

    describe('incrementRateLimit', () => {
      it('初回は 1、同じウィンドウ内では加算される', async () => {
        expect((await repository.incrementRateLimit('u1', '1m', NOW_MS)).count).toBe(1);
        expect((await repository.incrementRateLimit('u1', '1m', NOW_MS + 5_000)).count).toBe(2);
        expect((await repository.incrementRateLimit('u1', '1m', NOW_MS + 10_000)).count).toBe(3);
      });

      it('結果にウィンドウ種別を含む', async () => {
        const result = await repository.incrementRateLimit('u1', '1h', NOW_MS);
        expect(result).toEqual({ count: 1, window: '1h' });
      });

      it('ウィンドウを跨ぐとカウントが 1 に戻る', async () => {
        await repository.incrementRateLimit('u1', '1m', NOW_MS);
        await repository.incrementRateLimit('u1', '1m', NOW_MS);
        const next = await repository.incrementRateLimit('u1', '1m', NOW_MS + 60_000);
        expect(next.count).toBe(1);
      });

      it('1m と 1h は別のカウンタを持つ', async () => {
        await repository.incrementRateLimit('u1', '1m', NOW_MS);
        await repository.incrementRateLimit('u1', '1m', NOW_MS);
        expect((await repository.incrementRateLimit('u1', '1h', NOW_MS)).count).toBe(1);
        expect((await repository.incrementRateLimit('u1', '1m', NOW_MS)).count).toBe(3);
      });

      it('ユーザーごとにカウンタが独立する', async () => {
        await repository.incrementRateLimit('u1', '1m', NOW_MS);
        expect((await repository.incrementRateLimit('u2', '1m', NOW_MS)).count).toBe(1);
      });
    });

    describe('acquireLock', () => {
      it('未取得なら取得でき、ownerToken を返す', async () => {
        const result = await repository.acquireLock('u1', 'token-a', LOCK_TTL_MS, NOW_MS);
        expect(result).toEqual({ acquired: true, ownerToken: 'token-a' });
      });

      it('有効なロックがあれば取得できず、例外にもならない', async () => {
        await repository.acquireLock('u1', 'token-a', LOCK_TTL_MS, NOW_MS);
        const result = await repository.acquireLock('u1', 'token-b', LOCK_TTL_MS, NOW_MS + 1);
        expect(result).toEqual({ acquired: false });
      });

      it('期限ちょうどのロックはまだ有効', async () => {
        await repository.acquireLock('u1', 'token-a', LOCK_TTL_MS, NOW_MS);
        const result = await repository.acquireLock(
          'u1',
          'token-b',
          LOCK_TTL_MS,
          NOW_MS + LOCK_TTL_MS
        );
        expect(result.acquired).toBe(false);
      });

      it('期限切れのロックは奪取でき、旧所有者の解放では消えない', async () => {
        await repository.acquireLock('u1', 'token-a', LOCK_TTL_MS, NOW_MS);
        const takeover = await repository.acquireLock(
          'u1',
          'token-b',
          LOCK_TTL_MS,
          NOW_MS + LOCK_TTL_MS + 1
        );
        expect(takeover).toEqual({ acquired: true, ownerToken: 'token-b' });

        await repository.releaseLock('u1', 'token-a');
        const blocked = await repository.acquireLock(
          'u1',
          'token-c',
          LOCK_TTL_MS,
          NOW_MS + LOCK_TTL_MS + 2
        );
        expect(blocked.acquired).toBe(false);
      });

      it('ユーザーごとにロックが独立する', async () => {
        await repository.acquireLock('u1', 'token-a', LOCK_TTL_MS, NOW_MS);
        const result = await repository.acquireLock('u2', 'token-b', LOCK_TTL_MS, NOW_MS);
        expect(result.acquired).toBe(true);
      });
    });

    describe('releaseLock', () => {
      it('ownerToken が一致すれば解放され、再取得できる', async () => {
        await repository.acquireLock('u1', 'token-a', LOCK_TTL_MS, NOW_MS);
        await repository.releaseLock('u1', 'token-a');
        const result = await repository.acquireLock('u1', 'token-b', LOCK_TTL_MS, NOW_MS + 1);
        expect(result.acquired).toBe(true);
      });

      it('ownerToken が不一致なら例外にならず、ロックは残る', async () => {
        await repository.acquireLock('u1', 'token-a', LOCK_TTL_MS, NOW_MS);
        await expect(repository.releaseLock('u1', 'wrong')).resolves.toBeUndefined();
        const result = await repository.acquireLock('u1', 'token-b', LOCK_TTL_MS, NOW_MS + 1);
        expect(result.acquired).toBe(false);
      });

      it('ロックがなくても例外にならない', async () => {
        await expect(repository.releaseLock('u1', 'token-a')).resolves.toBeUndefined();
      });
    });
  });
}
