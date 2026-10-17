/**
 * ListRepository 契約テスト（実装非依存の振る舞い仕様）
 *
 * InMemory実装と実DynamoDB実装（DynamoDB Local）の双方に同一の仕様を通し、
 * 実装間の乖離を機械的に検知する。各テストは決定的で単一の結末を持つ。
 *
 * 個人リスト・グループリストの一覧は、ユーザー／グループのメタ情報やメンバーシップと
 * 同じパーティションに同居するため、SK の接頭辞で絞れていること（他の種別が混ざらないこと）を
 * 契約にする。順序は同じパーティション内の SK 昇順（リスト ID の昇順）で、実 DynamoDB が保証する。
 *
 * 削除は対象がなくても成功する（update・他の delete と挙動が異なる点に注意）。
 *
 * 旧形式（camelCase の属性名・ISO 文字列の時刻・Type なし）のアイテムは、移行前のデータが
 * 書き込まれるまで残るために読めて、一覧にも出て、更新で新名に置き換わる必要がある。
 */

import type { ListRepository } from '../../src/repositories/list/list-repository.interface.js';
import type { CreateGroupListInput, CreatePersonalListInput } from '../../src/types/index.js';
import type { RawStoreHooks } from './helpers/raw-store.js';
import {
  LEGACY_CREATED_AT,
  LEGACY_UPDATED_AT,
  toLegacyTimestamp,
  waitForTimestampAdvance,
} from './helpers/time.js';

/** 契約テストの対象実装が満たすべきフック */
export interface ListRepositoryContractHooks extends RawStoreHooks {
  /** テスト対象のリポジトリを生成する（reset の後に呼ばれる） */
  makeRepository: () => Promise<ListRepository>;
}

function buildPersonalListInput(
  overrides: Partial<CreatePersonalListInput> = {}
): CreatePersonalListInput {
  return {
    listId: 'list-1',
    userId: 'user-1',
    name: '買い物',
    isDefault: false,
    ...overrides,
  };
}

function buildGroupListInput(overrides: Partial<CreateGroupListInput> = {}): CreateGroupListInput {
  return {
    listId: 'list-1',
    groupId: 'group-1',
    name: '旅行',
    createdBy: 'user-1',
    ...overrides,
  };
}

/** 旧形式の個人リストアイテム */
function buildLegacyPersonalListItem(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    PK: 'USER#user-1',
    SK: 'PLIST#legacy-list',
    listId: 'legacy-list',
    userId: 'user-1',
    name: '旧形式',
    isDefault: true,
    createdAt: toLegacyTimestamp(LEGACY_CREATED_AT),
    updatedAt: toLegacyTimestamp(LEGACY_UPDATED_AT),
    ...overrides,
  };
}

/** 旧形式のグループリストアイテム */
function buildLegacyGroupListItem(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    PK: 'GROUP#group-1',
    SK: 'GLIST#legacy-list',
    listId: 'legacy-list',
    groupId: 'group-1',
    name: '旧形式',
    createdBy: 'user-1',
    createdAt: toLegacyTimestamp(LEGACY_CREATED_AT),
    updatedAt: toLegacyTimestamp(LEGACY_UPDATED_AT),
    ...overrides,
  };
}

function listIds(lists: Array<{ listId: string }>): string[] {
  return lists.map((list) => list.listId);
}

/**
 * ListRepository の契約テストスイートを定義する。
 *
 * @param label - テスト対象実装のラベル（describe名に使用）
 * @param hooks - テスト対象実装を操作するためのフック
 */
export function defineListRepositoryContract(
  label: string,
  hooks: ListRepositoryContractHooks
): void {
  describe(`ListRepository 契約: ${label}`, () => {
    let repository: ListRepository;

    beforeEach(async () => {
      await hooks.reset();
      repository = await hooks.makeRepository();
    });

    afterAll(async () => {
      if (hooks.teardown) {
        await hooks.teardown();
      }
    });

    describe('個人リストの CRUD', () => {
      it('create した個人リストを getPersonalListById で取得できる', async () => {
        const input = buildPersonalListInput();

        const created = await repository.createPersonalList(input);

        expect(created).toMatchObject(input);
        expect(typeof created.createdAt).toBe('number');
        // createdAt はリポジトリが、updatedAt は store が別々に現在時刻を読むため、一致は保証されない
        expect(created.updatedAt).toBeGreaterThanOrEqual(created.createdAt);
        expect(await repository.getPersonalListById('user-1', 'list-1')).toEqual(created);
      });

      it('保存形式は PascalCase の属性名と数値ミリ秒の時刻で、Type を持つ', async () => {
        const created = await repository.createPersonalList(buildPersonalListInput());

        const raw = await hooks.getRawItem('USER#user-1', 'PLIST#list-1');
        expect(raw).toMatchObject({
          Type: 'PersonalList',
          ListID: 'list-1',
          UserID: 'user-1',
          Name: '買い物',
          IsDefault: false,
          CreatedAt: created.createdAt,
          UpdatedAt: created.updatedAt,
        });
        for (const legacyName of [
          'listId',
          'userId',
          'name',
          'isDefault',
          'createdAt',
          'updatedAt',
        ]) {
          expect(raw).not.toHaveProperty(legacyName);
        }
      });

      it('getPersonalListById は存在しない個人リストに対して null を返す', async () => {
        expect(await repository.getPersonalListById('user-1', 'no-such-list')).toBeNull();
      });

      it('同じリスト ID の重複作成は EntityAlreadyExistsError をスローし、既存のリストを変えない', async () => {
        const first = await repository.createPersonalList(buildPersonalListInput());

        await expect(
          repository.createPersonalList(buildPersonalListInput({ name: '別の名前' }))
        ).rejects.toThrow(expect.objectContaining({ name: 'EntityAlreadyExistsError' }));

        expect(await repository.getPersonalListById('user-1', 'list-1')).toEqual(first);
      });

      it('update は更新後の Entity を返し、updatedAt が進み、他の項目は変わらない', async () => {
        const created = await repository.createPersonalList(buildPersonalListInput());
        await waitForTimestampAdvance();

        const updated = await repository.updatePersonalList('user-1', 'list-1', { name: '仕事' });

        expect(updated).toEqual({ ...created, name: '仕事', updatedAt: updated.updatedAt });
        expect(updated.updatedAt).toBeGreaterThan(created.updatedAt);
        expect(await repository.getPersonalListById('user-1', 'list-1')).toEqual(updated);
      });

      it('存在しない個人リストの update は EntityNotFoundError をスローし、アイテムを作らない', async () => {
        await expect(
          repository.updatePersonalList('user-1', 'no-such-list', { name: '仕事' })
        ).rejects.toThrow(expect.objectContaining({ name: 'EntityNotFoundError' }));

        expect(await repository.getPersonalListById('user-1', 'no-such-list')).toBeNull();
        expect(await hooks.getRawItem('USER#user-1', 'PLIST#no-such-list')).toBeUndefined();
      });

      it('delete すると取得できなくなり、他のリストは残る', async () => {
        await repository.createPersonalList(buildPersonalListInput({ listId: 'list-1' }));
        await repository.createPersonalList(buildPersonalListInput({ listId: 'list-2' }));

        await repository.deletePersonalList('user-1', 'list-1');

        expect(await repository.getPersonalListById('user-1', 'list-1')).toBeNull();
        expect(await repository.getPersonalListById('user-1', 'list-2')).not.toBeNull();
      });

      it('存在しない個人リストの delete は成功する', async () => {
        await expect(
          repository.deletePersonalList('user-1', 'no-such-list')
        ).resolves.toBeUndefined();
      });
    });

    describe('グループリストの CRUD', () => {
      it('create したグループリストを getGroupListById で取得できる', async () => {
        const input = buildGroupListInput();

        const created = await repository.createGroupList(input);

        expect(created).toMatchObject(input);
        expect(typeof created.createdAt).toBe('number');
        expect(created.updatedAt).toBeGreaterThanOrEqual(created.createdAt);
        expect(await repository.getGroupListById('group-1', 'list-1')).toEqual(created);
      });

      it('保存形式は PascalCase の属性名と数値ミリ秒の時刻で、Type を持つ', async () => {
        const created = await repository.createGroupList(buildGroupListInput());

        const raw = await hooks.getRawItem('GROUP#group-1', 'GLIST#list-1');
        expect(raw).toMatchObject({
          Type: 'GroupList',
          ListID: 'list-1',
          GroupID: 'group-1',
          Name: '旅行',
          CreatedBy: 'user-1',
          CreatedAt: created.createdAt,
          UpdatedAt: created.updatedAt,
        });
        for (const legacyName of [
          'listId',
          'groupId',
          'name',
          'createdBy',
          'createdAt',
          'updatedAt',
        ]) {
          expect(raw).not.toHaveProperty(legacyName);
        }
      });

      it('getGroupListById は存在しないグループリストに対して null を返す', async () => {
        expect(await repository.getGroupListById('group-1', 'no-such-list')).toBeNull();
      });

      it('同じリスト ID の重複作成は EntityAlreadyExistsError をスローし、既存のリストを変えない', async () => {
        const first = await repository.createGroupList(buildGroupListInput());

        await expect(
          repository.createGroupList(buildGroupListInput({ name: '別の名前' }))
        ).rejects.toThrow(expect.objectContaining({ name: 'EntityAlreadyExistsError' }));

        expect(await repository.getGroupListById('group-1', 'list-1')).toEqual(first);
      });

      it('update は更新後の Entity を返し、updatedAt が進み、他の項目は変わらない', async () => {
        const created = await repository.createGroupList(buildGroupListInput());
        await waitForTimestampAdvance();

        const updated = await repository.updateGroupList('group-1', 'list-1', { name: '出張' });

        expect(updated).toEqual({ ...created, name: '出張', updatedAt: updated.updatedAt });
        expect(updated.updatedAt).toBeGreaterThan(created.updatedAt);
        expect(await repository.getGroupListById('group-1', 'list-1')).toEqual(updated);
      });

      it('存在しないグループリストの update は EntityNotFoundError をスローし、アイテムを作らない', async () => {
        await expect(
          repository.updateGroupList('group-1', 'no-such-list', { name: '出張' })
        ).rejects.toThrow(expect.objectContaining({ name: 'EntityNotFoundError' }));

        expect(await repository.getGroupListById('group-1', 'no-such-list')).toBeNull();
        expect(await hooks.getRawItem('GROUP#group-1', 'GLIST#no-such-list')).toBeUndefined();
      });

      it('delete すると取得できなくなり、他のリストは残る', async () => {
        await repository.createGroupList(buildGroupListInput({ listId: 'list-1' }));
        await repository.createGroupList(buildGroupListInput({ listId: 'list-2' }));

        await repository.deleteGroupList('group-1', 'list-1');

        expect(await repository.getGroupListById('group-1', 'list-1')).toBeNull();
        expect(await repository.getGroupListById('group-1', 'list-2')).not.toBeNull();
      });

      it('存在しないグループリストの delete は成功する', async () => {
        await expect(
          repository.deleteGroupList('group-1', 'no-such-list')
        ).resolves.toBeUndefined();
      });
    });

    describe('一覧', () => {
      it('ユーザーの個人リストだけを、リスト ID の昇順で返す', async () => {
        // 作成順と ID 順が食い違う順で作り、SK 順で返ることを確かめる
        for (const listId of ['list-c', 'list-a', 'list-b']) {
          await repository.createPersonalList(buildPersonalListInput({ listId }));
        }

        expect(listIds(await repository.getPersonalListsByUserId('user-1'))).toEqual([
          'list-a',
          'list-b',
          'list-c',
        ]);
      });

      it('個人リストの一覧に、他のユーザーのリスト・グループリスト・同じパーティションの他の種別が混ざらない', async () => {
        await repository.createPersonalList(buildPersonalListInput({ listId: 'mine' }));
        await repository.createPersonalList(
          buildPersonalListInput({ listId: 'theirs', userId: 'user-2' })
        );
        // 同じ ID 文字列のグループのリスト（パーティションは GROUP# で別）
        await repository.createGroupList(
          buildGroupListInput({ listId: 'group-list', groupId: 'user-1' })
        );
        // ユーザーのメタ情報は個人リストと同じ USER# パーティションに同居する
        await hooks.putRawItem({
          PK: 'USER#user-1',
          SK: '#META#',
          Type: 'User',
          UserID: 'user-1',
        });

        expect(listIds(await repository.getPersonalListsByUserId('user-1'))).toEqual(['mine']);
      });

      it('個人リストが 1 件もなければ空の配列を返す', async () => {
        expect(await repository.getPersonalListsByUserId('user-1')).toEqual([]);
      });

      it('グループのグループリストだけを、リスト ID の昇順で返す', async () => {
        for (const listId of ['list-c', 'list-a', 'list-b']) {
          await repository.createGroupList(buildGroupListInput({ listId }));
        }

        expect(listIds(await repository.getGroupListsByGroupId('group-1'))).toEqual([
          'list-a',
          'list-b',
          'list-c',
        ]);
      });

      it('グループリストの一覧に、他のグループのリスト・個人リスト・同じパーティションの他の種別が混ざらない', async () => {
        await repository.createGroupList(buildGroupListInput({ listId: 'mine' }));
        await repository.createGroupList(
          buildGroupListInput({ listId: 'theirs', groupId: 'group-2' })
        );
        // 同じ ID 文字列のユーザーの個人リスト（パーティションは USER# で別）
        await repository.createPersonalList(
          buildPersonalListInput({ listId: 'personal', userId: 'group-1' })
        );
        // グループのメタ情報とメンバーシップはグループリストと同じ GROUP# パーティションに同居する
        await hooks.putRawItem({
          PK: 'GROUP#group-1',
          SK: '#META#',
          Type: 'Group',
          GroupID: 'group-1',
        });
        await hooks.putRawItem({
          PK: 'GROUP#group-1',
          SK: 'MEMBER#user-1',
          Type: 'GroupMembership',
          GroupID: 'group-1',
          UserID: 'user-1',
        });

        expect(listIds(await repository.getGroupListsByGroupId('group-1'))).toEqual(['mine']);
      });

      it('グループリストが 1 件もなければ空の配列を返す', async () => {
        expect(await repository.getGroupListsByGroupId('group-1')).toEqual([]);
      });
    });

    describe('旧形式のアイテム', () => {
      it('旧形式の個人リストを getPersonalListById で読める', async () => {
        await hooks.putRawItem(buildLegacyPersonalListItem());

        expect(await repository.getPersonalListById('user-1', 'legacy-list')).toEqual({
          listId: 'legacy-list',
          userId: 'user-1',
          name: '旧形式',
          isDefault: true,
          createdAt: LEGACY_CREATED_AT,
          updatedAt: LEGACY_UPDATED_AT,
        });
      });

      it('旧形式の個人リストが一覧に出る（新形式と混在してもリスト ID の昇順）', async () => {
        await hooks.putRawItem(
          buildLegacyPersonalListItem({ SK: 'PLIST#b-legacy', listId: 'b-legacy' })
        );
        await repository.createPersonalList(buildPersonalListInput({ listId: 'c-new' }));
        await repository.createPersonalList(buildPersonalListInput({ listId: 'a-new' }));

        expect(listIds(await repository.getPersonalListsByUserId('user-1'))).toEqual([
          'a-new',
          'b-legacy',
          'c-new',
        ]);
      });

      it('旧形式の個人リストを update すると、書いた属性が新名になり旧名が消え、再読み込みしても同じ Entity になる', async () => {
        await hooks.putRawItem(buildLegacyPersonalListItem());
        await waitForTimestampAdvance();

        const updated = await repository.updatePersonalList('user-1', 'legacy-list', {
          name: '更新後',
        });

        expect(updated).toMatchObject({
          listId: 'legacy-list',
          name: '更新後',
          isDefault: true,
          createdAt: LEGACY_CREATED_AT,
        });
        expect(updated.updatedAt).toBeGreaterThan(LEGACY_UPDATED_AT);

        const raw = await hooks.getRawItem('USER#user-1', 'PLIST#legacy-list');
        expect(raw).toMatchObject({ Name: '更新後', UpdatedAt: updated.updatedAt });
        expect(raw).not.toHaveProperty('name');
        expect(raw).not.toHaveProperty('updatedAt');
        expect(await repository.getPersonalListById('user-1', 'legacy-list')).toEqual(updated);
      });

      it('旧形式の個人リストを delete できる', async () => {
        await hooks.putRawItem(buildLegacyPersonalListItem());

        await repository.deletePersonalList('user-1', 'legacy-list');

        expect(await repository.getPersonalListById('user-1', 'legacy-list')).toBeNull();
      });

      it('旧形式のグループリストを getGroupListById で読める', async () => {
        await hooks.putRawItem(buildLegacyGroupListItem());

        expect(await repository.getGroupListById('group-1', 'legacy-list')).toEqual({
          listId: 'legacy-list',
          groupId: 'group-1',
          name: '旧形式',
          createdBy: 'user-1',
          createdAt: LEGACY_CREATED_AT,
          updatedAt: LEGACY_UPDATED_AT,
        });
      });

      it('旧形式のグループリストが一覧に出る（新形式と混在してもリスト ID の昇順）', async () => {
        await hooks.putRawItem(
          buildLegacyGroupListItem({ SK: 'GLIST#b-legacy', listId: 'b-legacy' })
        );
        await repository.createGroupList(buildGroupListInput({ listId: 'c-new' }));
        await repository.createGroupList(buildGroupListInput({ listId: 'a-new' }));

        expect(listIds(await repository.getGroupListsByGroupId('group-1'))).toEqual([
          'a-new',
          'b-legacy',
          'c-new',
        ]);
      });

      it('旧形式のグループリストを update すると、書いた属性が新名になり旧名が消え、再読み込みしても同じ Entity になる', async () => {
        await hooks.putRawItem(buildLegacyGroupListItem());
        await waitForTimestampAdvance();

        const updated = await repository.updateGroupList('group-1', 'legacy-list', {
          name: '更新後',
        });

        expect(updated).toMatchObject({
          listId: 'legacy-list',
          name: '更新後',
          createdBy: 'user-1',
          createdAt: LEGACY_CREATED_AT,
        });
        expect(updated.updatedAt).toBeGreaterThan(LEGACY_UPDATED_AT);

        const raw = await hooks.getRawItem('GROUP#group-1', 'GLIST#legacy-list');
        expect(raw).toMatchObject({ Name: '更新後', UpdatedAt: updated.updatedAt });
        expect(raw).not.toHaveProperty('name');
        expect(raw).not.toHaveProperty('updatedAt');
        expect(await repository.getGroupListById('group-1', 'legacy-list')).toEqual(updated);
      });

      it('旧形式のグループリストを delete できる', async () => {
        await hooks.putRawItem(buildLegacyGroupListItem());

        await repository.deleteGroupList('group-1', 'legacy-list');

        expect(await repository.getGroupListById('group-1', 'legacy-list')).toBeNull();
      });
    });
  });
}
