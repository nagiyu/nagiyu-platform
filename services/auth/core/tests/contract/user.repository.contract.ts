/**
 * UserRepository 契約テスト (実装非依存の振る舞い仕様)
 *
 * InMemory 実装と実 DynamoDB 実装 (DynamoDB Local) の双方に同一の仕様を通し、
 * 実装間の乖離 (GSI の引き当て・条件式・旧形式の読み書きなど) を機械的に検知する。
 * 各テストは決定的で単一の結末を持ち、実行時分岐で結末を変えない。
 */

import { EntityNotFoundError } from '@nagiyu/aws';
import type { UserRepository } from '../../src/repositories/user-repository';

/**
 * 契約テストの対象実装が満たすべきフック
 */
export interface UserRepositoryContractHooks {
  /** テスト対象のリポジトリを生成する (reset の後に呼ばれる) */
  makeRepository: () => Promise<UserRepository>;
  /** 各テスト前にストア／テーブルをクリーンな状態に戻す */
  reset: () => Promise<void>;
  /** 旧形式のアイテムなど、リポジトリを経由せずに Item を直接書き込む */
  putRawItem: (item: Record<string, unknown>) => Promise<void>;
  /** リポジトリを経由せずに Item を直接読む */
  getRawItem: (userId: string) => Promise<Record<string, unknown> | undefined>;
  /** 全テスト終了後の後始末 (テーブル削除等) */
  teardown?: () => Promise<void>;
}

const LEGACY_CREATED_AT = '2024-01-01T00:00:00.000Z';
const LEGACY_UPDATED_AT = '2024-02-01T00:00:00.000Z';

function buildUpsertInput(suffix: string, picture?: string) {
  return {
    googleId: `google-${suffix}`,
    email: `${suffix}@example.com`,
    name: `ユーザー${suffix}`,
    ...(picture !== undefined ? { picture } : {}),
  };
}

/**
 * UserRepository の契約テストスイートを定義する。
 *
 * @param label - テスト対象実装のラベル (describe 名に使用)
 * @param hooks - テスト対象実装を操作するためのフック
 */
export function defineUserRepositoryContract(
  label: string,
  hooks: UserRepositoryContractHooks
): void {
  describe(`UserRepository 契約: ${label}`, () => {
    let repository: UserRepository;

    beforeEach(async () => {
      await hooks.reset();
      repository = await hooks.makeRepository();
    });

    afterAll(async () => {
      if (hooks.teardown) {
        await hooks.teardown();
      }
    });

    it('upsertUser で作成したユーザーを ID と Google ID の両方で取得できる', async () => {
      const created = await repository.upsertUser(
        buildUpsertInput('a', 'https://example.com/a.png')
      );

      expect(created).toMatchObject({
        googleId: 'google-a',
        email: 'a@example.com',
        name: 'ユーザーa',
        picture: 'https://example.com/a.png',
        roles: [],
      });
      expect(typeof created.createdAt).toBe('number');
      // createdAt は呼び出し側、updatedAt は store が別に採時するため同一とは限らない
      expect(created.updatedAt).toBeGreaterThanOrEqual(created.createdAt);
      expect(created.lastLoginAt).toBeUndefined();

      expect(await repository.getUserById(created.userId)).toEqual(created);
      expect(await repository.getUserByGoogleId('google-a')).toEqual(created);
    });

    it('存在しないユーザーは null を返す', async () => {
      expect(await repository.getUserById('not-exist')).toBeNull();
      expect(await repository.getUserByGoogleId('google-not-exist')).toBeNull();
    });

    it('picture なしで作成したユーザーは picture を持たない', async () => {
      const created = await repository.upsertUser(buildUpsertInput('nopic'));

      const fetched = await repository.getUserById(created.userId);

      expect(fetched).not.toBeNull();
      expect(fetched).not.toHaveProperty('picture');
    });

    it('既存の Google ID で upsertUser すると name と picture だけを更新する', async () => {
      const created = await repository.upsertUser(
        buildUpsertInput('b', 'https://example.com/b.png')
      );
      await repository.assignRoles(created.userId, ['admin']);
      await new Promise((resolve) => setTimeout(resolve, 5));

      const updated = await repository.upsertUser({
        googleId: 'google-b',
        email: 'changed@example.com',
        name: '新しい名前',
        picture: 'https://example.com/b2.png',
      });

      expect(updated.userId).toBe(created.userId);
      expect(updated.name).toBe('新しい名前');
      expect(updated.picture).toBe('https://example.com/b2.png');
      expect(updated.email).toBe('b@example.com');
      expect(updated.roles).toEqual(['admin']);
      expect(updated.createdAt).toBe(created.createdAt);
      expect(updated.updatedAt).toBeGreaterThan(created.updatedAt);
    });

    it('既存ユーザーの upsertUser で picture がなければ保存済みの picture を消す', async () => {
      const created = await repository.upsertUser(
        buildUpsertInput('c', 'https://example.com/c.png')
      );

      const updated = await repository.upsertUser(buildUpsertInput('c'));

      expect(updated.userId).toBe(created.userId);
      expect(updated).not.toHaveProperty('picture');
      expect(await repository.getUserById(created.userId)).not.toHaveProperty('picture');
    });

    it('updateUser は指定した項目だけを更新し、更新後のユーザーを返す', async () => {
      const created = await repository.upsertUser(
        buildUpsertInput('d', 'https://example.com/d.png')
      );
      await new Promise((resolve) => setTimeout(resolve, 5));

      const updated = await repository.updateUser(created.userId, { name: '更新後' });

      expect(updated).toEqual({
        ...created,
        name: '更新後',
        updatedAt: updated.updatedAt,
      });
      expect(updated.updatedAt).toBeGreaterThan(created.updatedAt);
      expect(await repository.getUserById(created.userId)).toEqual(updated);
    });

    it('assignRoles でロールを置き換える', async () => {
      const created = await repository.upsertUser(buildUpsertInput('e'));

      const assigned = await repository.assignRoles(created.userId, ['admin', 'user-manager']);
      expect(assigned.roles).toEqual(['admin', 'user-manager']);

      const cleared = await repository.assignRoles(created.userId, []);
      expect(cleared.roles).toEqual([]);
    });

    it('updateLastLogin は lastLoginAt をミリ秒で記録する', async () => {
      const created = await repository.upsertUser(buildUpsertInput('f'));
      const before = Date.now();

      await repository.updateLastLogin(created.userId);

      const fetched = await repository.getUserById(created.userId);
      expect(fetched?.lastLoginAt).toBeGreaterThanOrEqual(before);
      expect(fetched?.lastLoginAt).toBeLessThanOrEqual(Date.now());
    });

    it('存在しないユーザーの更新系操作は EntityNotFoundError になる', async () => {
      await expect(repository.updateUser('not-exist', { name: 'x' })).rejects.toBeInstanceOf(
        EntityNotFoundError
      );
      await expect(repository.assignRoles('not-exist', ['admin'])).rejects.toBeInstanceOf(
        EntityNotFoundError
      );
      await expect(repository.updateLastLogin('not-exist')).rejects.toBeInstanceOf(
        EntityNotFoundError
      );
    });

    it('deleteUser でユーザーを削除でき、Google ID でも引き当てられなくなる', async () => {
      const created = await repository.upsertUser(buildUpsertInput('g'));

      await repository.deleteUser(created.userId);

      expect(await repository.getUserById(created.userId)).toBeNull();
      expect(await repository.getUserByGoogleId('google-g')).toBeNull();
    });

    it('存在しないユーザーの deleteUser は EntityNotFoundError になる', async () => {
      await expect(repository.deleteUser('not-exist')).rejects.toBeInstanceOf(EntityNotFoundError);
    });

    it('listUsers は limit と cursor で重複・欠落なく全件を走査できる', async () => {
      const createdIds: string[] = [];
      for (const suffix of ['p1', 'p2', 'p3', 'p4', 'p5']) {
        createdIds.push((await repository.upsertUser(buildUpsertInput(suffix))).userId);
      }

      const collected: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await repository.listUsers({ limit: 2, cursor });
        expect(page.count).toBe(page.items.length);
        collected.push(...page.items.map((user) => user.userId));
        cursor = page.nextCursor;
      } while (cursor);

      expect([...collected].sort()).toEqual([...createdIds].sort());
    });

    it('listUsers の count は limit で切れたページでも返した items の件数になる (総件数ではない)', async () => {
      for (const suffix of ['q1', 'q2', 'q3', 'q4', 'q5']) {
        await repository.upsertUser(buildUpsertInput(suffix));
      }

      const page = await repository.listUsers({ limit: 2 });

      expect(page.items).toHaveLength(2);
      expect(page.count).toBe(2);
    });

    it('listUsers は不正な cursor を無視して先頭から取得する', async () => {
      const created = await repository.upsertUser(buildUpsertInput('c1'));

      const page = await repository.listUsers({ limit: 10, cursor: 'invalid-base64' });

      expect(page.items.map((user) => user.userId)).toEqual([created.userId]);
    });

    it('旧形式 (旧属性名・ISO 文字列の時刻) のユーザーを読める', async () => {
      await hooks.putRawItem({
        userId: 'legacy-1',
        googleId: 'google-legacy-1',
        email: 'legacy@example.com',
        name: '旧ユーザー',
        picture: 'https://example.com/legacy.png',
        roles: ['admin'],
        createdAt: LEGACY_CREATED_AT,
        updatedAt: LEGACY_UPDATED_AT,
        lastLoginAt: LEGACY_UPDATED_AT,
      });

      const expected = {
        userId: 'legacy-1',
        googleId: 'google-legacy-1',
        email: 'legacy@example.com',
        name: '旧ユーザー',
        picture: 'https://example.com/legacy.png',
        roles: ['admin'],
        createdAt: Date.parse(LEGACY_CREATED_AT),
        updatedAt: Date.parse(LEGACY_UPDATED_AT),
        lastLoginAt: Date.parse(LEGACY_UPDATED_AT),
      };
      expect(await repository.getUserById('legacy-1')).toEqual(expected);
      expect(await repository.getUserByGoogleId('google-legacy-1')).toEqual(expected);
    });

    it('旧形式のユーザーを更新すると、新名で書き直され旧名が残らない', async () => {
      await hooks.putRawItem({
        userId: 'legacy-2',
        googleId: 'google-legacy-2',
        email: 'legacy2@example.com',
        name: '旧ユーザー2',
        picture: 'https://example.com/legacy2.png',
        roles: [],
        createdAt: LEGACY_CREATED_AT,
        updatedAt: LEGACY_UPDATED_AT,
      });

      await repository.updateUser('legacy-2', { name: '新ユーザー2', roles: ['admin'] });
      await repository.upsertUser({
        googleId: 'google-legacy-2',
        email: 'legacy2@example.com',
        name: '新ユーザー2',
      });

      const raw = await hooks.getRawItem('legacy-2');
      expect(raw).toMatchObject({
        userId: 'legacy-2',
        googleId: 'google-legacy-2',
        Name: '新ユーザー2',
        Roles: ['admin'],
      });
      expect(raw).not.toHaveProperty('name');
      expect(raw).not.toHaveProperty('roles');
      expect(raw).not.toHaveProperty('picture');
      expect(raw).not.toHaveProperty('Picture');
      expect(raw).not.toHaveProperty('updatedAt');
      expect(typeof raw?.UpdatedAt).toBe('number');
      // 書き換えていない属性は旧名のまま残り、読み取りの互換で読み続けられる
      expect(raw?.createdAt).toBe(LEGACY_CREATED_AT);
      expect((await repository.getUserById('legacy-2'))?.createdAt).toBe(
        Date.parse(LEGACY_CREATED_AT)
      );
    });
  });
}
