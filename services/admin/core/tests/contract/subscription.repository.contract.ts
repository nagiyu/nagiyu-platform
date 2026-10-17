/**
 * PushSubscriptionRepository 契約テスト (実装非依存の振る舞い仕様)
 *
 * InMemory 実装と DynamoDB Local 実装に同じ仕様を通し、両実装の乖離を機械的に検知する。
 * 各テストは決定的で、実行時の分岐で結末を変えない。
 */

import { afterAll, afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createSubscriptionId, logger } from '@nagiyu/common';
import type { PushSubscriptionRepository } from '../../src/notify/subscription-repository.js';

/** 契約テストの対象実装が満たすべきフック */
export interface SubscriptionRepositoryContractHooks {
  /** テスト対象のリポジトリを生成する (reset の後に呼ばれる) */
  makeRepository: () => Promise<PushSubscriptionRepository>;
  /** 各テスト前にストア/テーブルをクリーンな状態に戻す */
  reset: () => Promise<void>;
  /** 全テスト終了後の後始末 */
  teardown?: () => Promise<void>;
  /** 保存形式を直接指定して Item を書き込む (旧形式のデータを再現するために使う) */
  putRawItem: (item: Record<string, unknown>) => Promise<void>;
  /** 保存されている Item を保存形式のまま読む */
  getRawItem: (pk: string, sk: string) => Promise<Record<string, unknown> | undefined>;
}

const LEGACY_ATTRIBUTE_NAMES = [
  'subscriptionId',
  'userId',
  'endpoint',
  'p256dhKey',
  'authKey',
  'createdAt',
  'updatedAt',
] as const;

/** 1 件あたり 300KB 程度の埋め草。数件で DynamoDB の 1MB のページ上限を超えさせる */
const LARGE_PADDING = 'x'.repeat(300 * 1024);

function buildInput(endpoint: string, userId = 'admin-user-1') {
  return {
    userId,
    subscription: { endpoint, keys: { p256dh: 'p256dh-key', auth: 'auth-key' } },
  };
}

/** 旧形式 (小文字始まりの属性名・ISO 文字列の時刻) の購読 Item を作る */
async function buildLegacyItem(
  endpoint: string,
  overrides: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  const subscriptionId = await createSubscriptionId(endpoint);
  return {
    PK: `SUBSCRIPTION#${subscriptionId}`,
    SK: `SUBSCRIPTION#${subscriptionId}`,
    Type: 'Subscription',
    GSI1PK: 'USER#legacy-user',
    GSI1SK: `SUBSCRIPTION#${subscriptionId}`,
    GSI2PK: 'ENDPOINT#legacy-hash',
    subscriptionId,
    userId: 'legacy-user',
    endpoint,
    p256dhKey: 'legacy-p256dh',
    authKey: 'legacy-auth',
    createdAt: '2025-12-31T00:00:00.000Z',
    updatedAt: '2025-12-31T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * PushSubscriptionRepository の契約テストスイートを定義する。
 *
 * @param label - テスト対象実装のラベル (describe 名に使用)
 * @param hooks - テスト対象実装を操作するためのフック
 */
export function defineSubscriptionRepositoryContract(
  label: string,
  hooks: SubscriptionRepositoryContractHooks
): void {
  describe(`PushSubscriptionRepository 契約: ${label}`, () => {
    let repository: PushSubscriptionRepository;
    let errorSpy: ReturnType<typeof jest.spyOn>;

    beforeEach(async () => {
      await hooks.reset();
      repository = await hooks.makeRepository();
      errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    afterAll(async () => {
      await hooks.teardown?.();
    });

    describe('save / findAll', () => {
      it('保存した購読を findAll で読み戻せる', async () => {
        const saved = await repository.save(buildInput('https://example.com/a'));

        const all = await repository.findAll();

        expect(all).toEqual([saved]);
        expect(saved.subscriptionId).toMatch(/^sub_[0-9a-f]{32}$/);
        expect(typeof saved.createdAt).toBe('number');
        expect(saved.updatedAt).toBeGreaterThanOrEqual(saved.createdAt);
      });

      it('新形式 (PascalCase・ミリ秒) で保存し、キー・GSI 属性は据え置く', async () => {
        const saved = await repository.save(buildInput('https://example.com/a'));

        const raw = await hooks.getRawItem(
          `SUBSCRIPTION#${saved.subscriptionId}`,
          `SUBSCRIPTION#${saved.subscriptionId}`
        );

        expect(raw).toMatchObject({
          Type: 'Subscription',
          GSI1PK: 'USER#admin-user-1',
          GSI1SK: `SUBSCRIPTION#${saved.subscriptionId}`,
          SubscriptionID: saved.subscriptionId,
          UserID: 'admin-user-1',
          Endpoint: 'https://example.com/a',
          P256dhKey: 'p256dh-key',
          AuthKey: 'auth-key',
          CreatedAt: saved.createdAt,
          UpdatedAt: saved.updatedAt,
        });
        expect(raw?.GSI2PK).toMatch(/^ENDPOINT#[0-9a-f]{64}$/);
      });

      it('同じ endpoint の再登録は 1 件のまま上書きされる', async () => {
        const first = await repository.save(buildInput('https://example.com/a', 'user-1'));
        const second = await repository.save(buildInput('https://example.com/a', 'user-2'));

        const all = await repository.findAll();

        expect(second.subscriptionId).toBe(first.subscriptionId);
        expect(all).toHaveLength(1);
        expect(all[0].userId).toBe('user-2');
      });

      it('endpoint が空文字なら保存できず、何も書かない', async () => {
        await expect(repository.save(buildInput(''))).rejects.toThrow(
          'endpoint は空文字にできません'
        );

        expect(await repository.findAll()).toEqual([]);
      });

      it('購読でない Item (Type が異なる) は返さない', async () => {
        await hooks.putRawItem({ PK: 'ERROR#1', SK: 'ERROR#1', Type: 'ErrorEvent' });
        const saved = await repository.save(buildInput('https://example.com/a'));

        expect(await repository.findAll()).toEqual([saved]);
      });

      it('旧形式の Item を読める (時刻は ISO 文字列からミリ秒へ)', async () => {
        const item = await buildLegacyItem('https://example.com/legacy');
        await hooks.putRawItem(item);

        const all = await repository.findAll();

        expect(all).toEqual([
          {
            subscriptionId: item.subscriptionId,
            userId: 'legacy-user',
            subscription: {
              endpoint: 'https://example.com/legacy',
              keys: { p256dh: 'legacy-p256dh', auth: 'legacy-auth' },
            },
            createdAt: Date.parse('2025-12-31T00:00:00.000Z'),
            updatedAt: Date.parse('2025-12-31T00:00:00.000Z'),
          },
        ]);
      });

      it('旧形式のアイテムは save で新形式に置き換わり、旧名が残らない', async () => {
        const endpoint = 'https://example.com/legacy';
        const legacy = await buildLegacyItem(endpoint);
        await hooks.putRawItem(legacy);

        const saved = await repository.save(buildInput(endpoint, 'new-user'));
        const raw = await hooks.getRawItem(legacy.PK as string, legacy.SK as string);

        expect(raw).toMatchObject({
          SubscriptionID: saved.subscriptionId,
          UserID: 'new-user',
          Endpoint: endpoint,
          CreatedAt: saved.createdAt,
          UpdatedAt: saved.updatedAt,
          GSI1PK: 'USER#new-user',
        });
        for (const name of LEGACY_ATTRIBUTE_NAMES) {
          expect(raw).not.toHaveProperty(name);
        }
        expect(await repository.findAll()).toEqual([saved]);
      });

      it('1 回の Scan に収まらない件数でも全件返す', async () => {
        const largeCount = 6;
        for (let i = 0; i < largeCount; i++) {
          await hooks.putRawItem(
            await buildLegacyItem(`https://example.com/large-${i}`, { padding: LARGE_PADDING })
          );
        }
        for (let i = 0; i < 120; i++) {
          await repository.save(buildInput(`https://example.com/small-${i}`));
        }

        const all = await repository.findAll();

        expect(all).toHaveLength(largeCount + 120);
        expect(new Set(all.map((r) => r.subscriptionId)).size).toBe(largeCount + 120);
      });
    });

    describe('読めないアイテム', () => {
      it('読めない Item は除外して残りを返し、件数と理由をエラーログに出す', async () => {
        const saved = await repository.save(buildInput('https://example.com/ok'));
        await hooks.putRawItem(
          await buildLegacyItem('https://example.com/broken', { authKey: undefined })
        );
        await hooks.putRawItem({
          PK: 'SUBSCRIPTION#bad-time',
          SK: 'SUBSCRIPTION#bad-time',
          Type: 'Subscription',
          SubscriptionID: 'bad-time',
          UserID: 'u',
          Endpoint: 'https://example.com/bad-time',
          P256dhKey: 'p',
          AuthKey: 'a',
          CreatedAt: 'not-a-date',
          UpdatedAt: 1767225600000,
        });

        const all = await repository.findAll();

        expect(all).toEqual([saved]);
        expect(errorSpy).toHaveBeenCalledTimes(1);
        const context = errorSpy.mock.calls[0][1] as {
          unreadableCount: number;
          unreadable: Array<{ pk?: string; reason: string }>;
        };
        expect(context.unreadableCount).toBe(2);
        expect(context.unreadable.map((u) => u.reason).join('\n')).toContain('AuthKey');
        expect(context.unreadable.map((u) => u.reason).join('\n')).toContain('CreatedAt');
      });

      it('すべて読めるときはエラーログを出さない', async () => {
        await repository.save(buildInput('https://example.com/ok'));

        await repository.findAll();

        expect(errorSpy).not.toHaveBeenCalled();
      });
    });

    describe('deleteByEndpoint', () => {
      it('同じ endpoint の購読だけを消し、消した件数を返す', async () => {
        const target = await repository.save(buildInput('https://example.com/target'));
        const other = await repository.save(buildInput('https://example.com/other'));

        const deleted = await repository.deleteByEndpoint('https://example.com/target');

        expect(deleted).toBe(1);
        expect(await repository.findAll()).toEqual([other]);
        expect(
          await hooks.getRawItem(
            `SUBSCRIPTION#${target.subscriptionId}`,
            `SUBSCRIPTION#${target.subscriptionId}`
          )
        ).toBeUndefined();
      });

      it('該当がなければ 0 件を返し、何も消さない', async () => {
        const saved = await repository.save(buildInput('https://example.com/a'));

        expect(await repository.deleteByEndpoint('https://example.com/none')).toBe(0);
        expect(await repository.findAll()).toEqual([saved]);
      });

      it('同じ endpoint を 2 回消しても 2 回目は 0 件で成功する', async () => {
        await repository.save(buildInput('https://example.com/a'));

        expect(await repository.deleteByEndpoint('https://example.com/a')).toBe(1);
        expect(await repository.deleteByEndpoint('https://example.com/a')).toBe(0);
      });

      it('本体が読めない Item でも、キーで消せる', async () => {
        const endpoint = 'https://example.com/broken';
        const saved = await repository.save(buildInput(endpoint));
        const pk = `SUBSCRIPTION#${saved.subscriptionId}`;
        const { AuthKey: _authKey, ...broken } = (await hooks.getRawItem(pk, pk)) ?? {};
        void _authKey;
        await hooks.putRawItem(broken);

        expect(await repository.deleteByEndpoint(endpoint)).toBe(1);
        expect(await hooks.getRawItem(pk, pk)).toBeUndefined();
      });

      it('endpoint が空文字ならエラーにする', async () => {
        await expect(repository.deleteByEndpoint('')).rejects.toThrow(
          'endpoint は空文字にできません'
        );
      });
    });
  });
}
