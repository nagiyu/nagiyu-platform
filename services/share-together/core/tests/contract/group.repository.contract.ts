/**
 * GroupRepository 契約テスト（実装非依存の振る舞い仕様）
 *
 * InMemory実装と実DynamoDB実装（DynamoDB Local）の双方に同一の仕様を通し、
 * 実装間の乖離を機械的に検知する。各テストは決定的で単一の結末を持つ。
 *
 * batchGetByIds は順序を契約にしない（実 DynamoDB の BatchGetItem は順序を保証しない）ため、
 * ID の集合で比べる。
 *
 * 旧形式（camelCase の属性名・ISO 文字列の時刻・Type なし）のアイテムは、移行前のデータが
 * 書き込まれるまで残るために読めて、更新で新名に置き換わる必要がある。
 */

import type { GroupRepository } from '../../src/repositories/group/group-repository.interface.js';
import type { CreateGroupInput } from '../../src/types/index.js';
import type { RawStoreHooks } from './helpers/raw-store.js';
import {
  LEGACY_CREATED_AT,
  LEGACY_UPDATED_AT,
  toLegacyTimestamp,
  waitForTimestampAdvance,
} from './helpers/time.js';

/** 契約テストの対象実装が満たすべきフック */
export interface GroupRepositoryContractHooks extends RawStoreHooks {
  /** テスト対象のリポジトリを生成する（reset の後に呼ばれる） */
  makeRepository: () => Promise<GroupRepository>;
}

function buildGroupInput(overrides: Partial<CreateGroupInput> = {}): CreateGroupInput {
  return {
    groupId: 'group-1',
    name: '家族',
    ownerUserId: 'owner-1',
    ...overrides,
  };
}

/** 旧形式のグループアイテム */
function buildLegacyGroupItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    PK: 'GROUP#legacy-1',
    SK: '#META#',
    groupId: 'legacy-1',
    name: '旧形式',
    ownerUserId: 'legacy-owner',
    createdAt: toLegacyTimestamp(LEGACY_CREATED_AT),
    updatedAt: toLegacyTimestamp(LEGACY_UPDATED_AT),
    ...overrides,
  };
}

function sortedGroupIds(groups: Array<{ groupId: string }>): string[] {
  return groups.map((group) => group.groupId).sort();
}

/**
 * GroupRepository の契約テストスイートを定義する。
 *
 * @param label - テスト対象実装のラベル（describe名に使用）
 * @param hooks - テスト対象実装を操作するためのフック
 */
export function defineGroupRepositoryContract(
  label: string,
  hooks: GroupRepositoryContractHooks
): void {
  describe(`GroupRepository 契約: ${label}`, () => {
    let repository: GroupRepository;

    beforeEach(async () => {
      await hooks.reset();
      repository = await hooks.makeRepository();
    });

    afterAll(async () => {
      if (hooks.teardown) {
        await hooks.teardown();
      }
    });

    describe('CRUD', () => {
      it('create したグループを getById で取得できる', async () => {
        const input = buildGroupInput();

        const created = await repository.create(input);

        expect(created).toMatchObject(input);
        expect(typeof created.createdAt).toBe('number');
        // createdAt はリポジトリが、updatedAt は store が別々に現在時刻を読むため、一致は保証されない
        expect(created.updatedAt).toBeGreaterThanOrEqual(created.createdAt);
        expect(await repository.getById(input.groupId)).toEqual(created);
      });

      it('保存形式は PascalCase の属性名と数値ミリ秒の時刻で、Type を持つ', async () => {
        const created = await repository.create(buildGroupInput());

        const raw = await hooks.getRawItem('GROUP#group-1', '#META#');
        expect(raw).toMatchObject({
          Type: 'Group',
          GroupID: 'group-1',
          Name: '家族',
          OwnerUserID: 'owner-1',
          CreatedAt: created.createdAt,
          UpdatedAt: created.updatedAt,
        });
        for (const legacyName of ['groupId', 'name', 'ownerUserId', 'createdAt', 'updatedAt']) {
          expect(raw).not.toHaveProperty(legacyName);
        }
      });

      it('getById は存在しないグループに対して null を返す', async () => {
        expect(await repository.getById('no-such-group')).toBeNull();
      });

      it('同じグループ ID の重複作成は EntityAlreadyExistsError をスローし、既存のグループを変えない', async () => {
        const first = await repository.create(buildGroupInput());

        await expect(repository.create(buildGroupInput({ name: '別のグループ' }))).rejects.toThrow(
          expect.objectContaining({ name: 'EntityAlreadyExistsError' })
        );

        expect(await repository.getById('group-1')).toEqual(first);
      });

      it('update は更新後の Entity を返し、updatedAt が進み、他の項目は変わらない', async () => {
        const created = await repository.create(buildGroupInput());
        await waitForTimestampAdvance();

        const updated = await repository.update('group-1', { name: '友人' });

        expect(updated).toEqual({ ...created, name: '友人', updatedAt: updated.updatedAt });
        expect(updated.updatedAt).toBeGreaterThan(created.updatedAt);
        expect(await repository.getById('group-1')).toEqual(updated);
      });

      it('存在しないグループの update は EntityNotFoundError をスローし、アイテムを作らない', async () => {
        await expect(repository.update('no-such-group', { name: '友人' })).rejects.toThrow(
          expect.objectContaining({ name: 'EntityNotFoundError' })
        );

        expect(await repository.getById('no-such-group')).toBeNull();
        expect(await hooks.getRawItem('GROUP#no-such-group', '#META#')).toBeUndefined();
      });

      it('delete すると getById で取得できなくなる', async () => {
        await repository.create(buildGroupInput());

        await repository.delete('group-1');

        expect(await repository.getById('group-1')).toBeNull();
      });

      it('存在しないグループの delete は EntityNotFoundError をスローする', async () => {
        await expect(repository.delete('no-such-group')).rejects.toThrow(
          expect.objectContaining({ name: 'EntityNotFoundError' })
        );
      });
    });

    describe('batchGetByIds', () => {
      it('指定した ID のグループを集合として返す', async () => {
        for (const id of ['group-1', 'group-2', 'group-3']) {
          await repository.create(buildGroupInput({ groupId: id }));
        }

        const groups = await repository.batchGetByIds(['group-3', 'group-1']);

        expect(sortedGroupIds(groups)).toEqual(['group-1', 'group-3']);
      });

      it('重複した ID は 1 件にまとめて返す', async () => {
        await repository.create(buildGroupInput({ groupId: 'group-1' }));

        const groups = await repository.batchGetByIds(['group-1', 'group-1', 'group-1']);

        expect(sortedGroupIds(groups)).toEqual(['group-1']);
      });

      it('存在しない ID は結果に含めない', async () => {
        await repository.create(buildGroupInput({ groupId: 'group-1' }));

        const groups = await repository.batchGetByIds(['no-such-group', 'group-1']);

        expect(sortedGroupIds(groups)).toEqual(['group-1']);
      });

      it('空の配列には空の配列を返す', async () => {
        expect(await repository.batchGetByIds([])).toEqual([]);
      });

      // BatchGetItem の上限は 1 回 100 件。ちょうど使い切る件数とそれを 1 件超える件数で分割を確かめる
      it.each([100, 101])('%i 件の ID でも全件を返す', async (count) => {
        const ids = Array.from(
          { length: count },
          (_, index) => `group-${String(index).padStart(3, '0')}`
        );
        for (const id of ids) {
          await repository.create(buildGroupInput({ groupId: id }));
        }

        const groups = await repository.batchGetByIds([
          ...ids,
          ...ids.slice(0, 10),
          'no-such-group',
        ]);

        expect(sortedGroupIds(groups)).toEqual(ids);
      });
    });

    describe('旧形式のアイテム', () => {
      it('旧形式のグループを getById で読める', async () => {
        await hooks.putRawItem(buildLegacyGroupItem());

        expect(await repository.getById('legacy-1')).toEqual({
          groupId: 'legacy-1',
          name: '旧形式',
          ownerUserId: 'legacy-owner',
          createdAt: LEGACY_CREATED_AT,
          updatedAt: LEGACY_UPDATED_AT,
        });
      });

      it('旧形式のグループを batchGetByIds で引ける', async () => {
        await hooks.putRawItem(buildLegacyGroupItem());
        await repository.create(buildGroupInput());

        const groups = await repository.batchGetByIds(['legacy-1', 'group-1']);

        expect(sortedGroupIds(groups)).toEqual(['group-1', 'legacy-1']);
      });

      it('旧形式のグループを update すると、書いた属性が新名になり旧名が消え、再読み込みしても同じ Entity になる', async () => {
        await hooks.putRawItem(buildLegacyGroupItem());
        await waitForTimestampAdvance();

        const updated = await repository.update('legacy-1', { name: '更新後' });

        expect(updated).toMatchObject({
          groupId: 'legacy-1',
          name: '更新後',
          ownerUserId: 'legacy-owner',
          createdAt: LEGACY_CREATED_AT,
        });
        expect(updated.updatedAt).toBeGreaterThan(LEGACY_UPDATED_AT);

        const raw = await hooks.getRawItem('GROUP#legacy-1', '#META#');
        expect(raw).toMatchObject({ Name: '更新後', UpdatedAt: updated.updatedAt });
        expect(raw).not.toHaveProperty('name');
        expect(raw).not.toHaveProperty('updatedAt');
        expect(await repository.getById('legacy-1')).toEqual(updated);
      });

      it('旧形式のグループを delete できる', async () => {
        await hooks.putRawItem(buildLegacyGroupItem());

        await repository.delete('legacy-1');

        expect(await repository.getById('legacy-1')).toBeNull();
      });
    });
  });
}
