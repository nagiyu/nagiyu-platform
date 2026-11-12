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

    describe('tryConsumeRateLimit', () => {
      const limits = { perMinute: 3, perHour: 5 };

      it('上限までは通し、その次の 1 分の窓で断る', async () => {
        for (let i = 0; i < 3; i++) {
          expect(await repository.tryConsumeRateLimit('u1', NOW_MS + i, limits)).toEqual({
            allowed: true,
          });
        }
        expect(await repository.tryConsumeRateLimit('u1', NOW_MS + 5, limits)).toEqual({
          allowed: false,
          window: '1m',
        });
      });

      it('1 分の窓を跨ぐと 1 分の回数が戻る', async () => {
        for (let i = 0; i < 3; i++) {
          await repository.tryConsumeRateLimit('u1', NOW_MS, limits);
        }
        expect(await repository.tryConsumeRateLimit('u1', NOW_MS + 60_000, limits)).toEqual({
          allowed: true,
        });
      });

      it('1 時間の窓で断ったら 1 分の回数を戻す', async () => {
        // 1 時間の上限 5 を、分をまたいで使い切る
        for (let minute = 0; minute < 5; minute++) {
          expect(
            await repository.tryConsumeRateLimit('u1', NOW_MS + minute * 60_000, limits)
          ).toEqual({ allowed: true });
        }
        const denied = NOW_MS + 5 * 60_000;
        expect(await repository.tryConsumeRateLimit('u1', denied, limits)).toEqual({
          allowed: false,
          window: '1h',
        });
        // 断られた申し込みが 1 分を消費していれば、上限 1 でも通らなくなる
        expect(
          await repository.tryConsumeRateLimit('u1', denied, { perMinute: 1, perHour: 6 })
        ).toEqual({ allowed: true });
      });

      it('断られ続けても 1 時間の回数は増えない', async () => {
        for (let i = 0; i < 3; i++) {
          await repository.tryConsumeRateLimit('u1', NOW_MS, limits);
        }
        for (let i = 0; i < 10; i++) {
          await repository.tryConsumeRateLimit('u1', NOW_MS, limits);
        }
        // 1 時間は 3 回分だけ。次の分に入れば残り 2 回通る
        expect(await repository.tryConsumeRateLimit('u1', NOW_MS + 60_000, limits)).toEqual({
          allowed: true,
        });
        expect(await repository.tryConsumeRateLimit('u1', NOW_MS + 60_000, limits)).toEqual({
          allowed: true,
        });
        expect(await repository.tryConsumeRateLimit('u1', NOW_MS + 60_000, limits)).toEqual({
          allowed: false,
          window: '1h',
        });
      });

      it('ユーザーごとにカウンタが独立する', async () => {
        for (let i = 0; i < 3; i++) {
          await repository.tryConsumeRateLimit('u1', NOW_MS, limits);
        }
        expect(await repository.tryConsumeRateLimit('u2', NOW_MS, limits)).toEqual({
          allowed: true,
        });
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
