import {
  EntityAlreadyExistsError,
  EntityNotFoundError,
  InMemorySingleTableStore,
} from '@nagiyu/aws';
import { InMemoryListRepository } from '../../../../src/repositories/list/in-memory-list-repository.js';
import type { CreateGroupListInput, CreatePersonalListInput } from '../../../../src/types/index.js';

function personalInput(overrides: Partial<CreatePersonalListInput> = {}): CreatePersonalListInput {
  return {
    listId: 'list-1',
    userId: 'user-1',
    name: '個人リスト',
    isDefault: false,
    ...overrides,
  };
}

function groupInput(overrides: Partial<CreateGroupListInput> = {}): CreateGroupListInput {
  return {
    listId: 'glist-1',
    groupId: 'group-1',
    name: '共有リスト',
    createdBy: 'user-1',
    ...overrides,
  };
}

describe('InMemoryListRepository', () => {
  let repository: InMemoryListRepository;
  let store: InMemorySingleTableStore;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    repository = new InMemoryListRepository(store);
  });

  describe('個人リスト', () => {
    it('数値ミリ秒の時刻付きで作成し、IDで取得できる', async () => {
      const before = Date.now();
      const created = await repository.createPersonalList(personalInput());

      expect(created).toMatchObject(personalInput());
      expect(created.createdAt).toBeGreaterThanOrEqual(before);
      expect(created.updatedAt).toBeGreaterThanOrEqual(created.createdAt);
      await expect(repository.getPersonalListById('user-1', 'list-1')).resolves.toEqual(created);
    });

    it('共有ストアに保存形式の Item を書く', async () => {
      await repository.createPersonalList(personalInput({ isDefault: true }));

      expect(store.get('USER#user-1', 'PLIST#list-1')).toMatchObject({
        Type: 'PersonalList',
        ListID: 'list-1',
        UserID: 'user-1',
        IsDefault: true,
      });
    });

    it('同じ ID を作成すると EntityAlreadyExistsError をスローする', async () => {
      await repository.createPersonalList(personalInput());
      await expect(repository.createPersonalList(personalInput())).rejects.toThrow(
        EntityAlreadyExistsError
      );
    });

    it('存在しない ID は null を返す', async () => {
      await expect(repository.getPersonalListById('user-1', 'none')).resolves.toBeNull();
    });

    it('一覧はそのユーザーの個人リストだけを SK (リスト ID) 順で返す', async () => {
      await repository.createPersonalList(personalInput({ listId: 'list-b' }));
      await repository.createPersonalList(personalInput({ listId: 'list-a' }));
      await repository.createPersonalList(personalInput({ listId: 'list-x', userId: 'user-2' }));
      await repository.createGroupList(groupInput({ groupId: 'user-1' }));

      const lists = await repository.getPersonalListsByUserId('user-1');

      expect(lists.map((list) => list.listId)).toEqual(['list-a', 'list-b']);
    });

    it('一覧は既定の件数上限を超えても全件返す', async () => {
      for (let index = 0; index < 120; index++) {
        await repository.createPersonalList(
          personalInput({ listId: `list-${String(index).padStart(3, '0')}` })
        );
      }

      await expect(repository.getPersonalListsByUserId('user-1')).resolves.toHaveLength(120);
    });

    it('名前だけを更新し、updatedAt を進める', async () => {
      const created = await repository.createPersonalList(personalInput({ isDefault: true }));

      const updated = await repository.updatePersonalList('user-1', 'list-1', { name: '新名' });

      expect(updated).toMatchObject({
        name: '新名',
        isDefault: true,
        createdAt: created.createdAt,
      });
      expect(updated.updatedAt).toBeGreaterThanOrEqual(created.updatedAt);
    });

    it('存在しないリストの更新は EntityNotFoundError をスローする', async () => {
      await expect(repository.updatePersonalList('user-1', 'none', { name: 'n' })).rejects.toThrow(
        EntityNotFoundError
      );
    });

    it('削除すると取得できなくなる', async () => {
      await repository.createPersonalList(personalInput());

      await repository.deletePersonalList('user-1', 'list-1');

      await expect(repository.getPersonalListById('user-1', 'list-1')).resolves.toBeNull();
    });

    it('存在しないリストの削除も成功する (冪等)', async () => {
      await expect(repository.deletePersonalList('user-1', 'none')).resolves.toBeUndefined();
    });

    it('デフォルトリストでもリポジトリは削除を拒否しない', async () => {
      await repository.createPersonalList(personalInput({ isDefault: true }));

      await repository.deletePersonalList('user-1', 'list-1');

      await expect(repository.getPersonalListById('user-1', 'list-1')).resolves.toBeNull();
    });
  });

  describe('グループリスト', () => {
    it('数値ミリ秒の時刻付きで作成し、IDで取得できる', async () => {
      const before = Date.now();
      const created = await repository.createGroupList(groupInput());

      expect(created).toMatchObject(groupInput());
      expect(created.createdAt).toBeGreaterThanOrEqual(before);
      await expect(repository.getGroupListById('group-1', 'glist-1')).resolves.toEqual(created);
    });

    it('共有ストアに保存形式の Item を書く', async () => {
      await repository.createGroupList(groupInput());

      expect(store.get('GROUP#group-1', 'GLIST#glist-1')).toMatchObject({
        Type: 'GroupList',
        ListID: 'glist-1',
        GroupID: 'group-1',
        CreatedBy: 'user-1',
      });
    });

    it('同じ ID を作成すると EntityAlreadyExistsError をスローする', async () => {
      await repository.createGroupList(groupInput());
      await expect(repository.createGroupList(groupInput())).rejects.toThrow(
        EntityAlreadyExistsError
      );
    });

    it('一覧はそのグループのグループリストだけを SK (リスト ID) 順で返す', async () => {
      await repository.createGroupList(groupInput({ listId: 'glist-b' }));
      await repository.createGroupList(groupInput({ listId: 'glist-a' }));
      await repository.createGroupList(groupInput({ listId: 'glist-x', groupId: 'group-2' }));

      const lists = await repository.getGroupListsByGroupId('group-1');

      expect(lists.map((list) => list.listId)).toEqual(['glist-a', 'glist-b']);
    });

    it('名前だけを更新し、createdBy は変えない', async () => {
      await repository.createGroupList(groupInput());

      const updated = await repository.updateGroupList('group-1', 'glist-1', { name: '新名' });

      expect(updated).toMatchObject({ name: '新名', createdBy: 'user-1' });
    });

    it('存在しないリストの更新は EntityNotFoundError をスローする', async () => {
      await expect(repository.updateGroupList('group-1', 'none', { name: 'n' })).rejects.toThrow(
        EntityNotFoundError
      );
    });

    it('削除すると取得できなくなり、存在しなくても成功する (冪等)', async () => {
      await repository.createGroupList(groupInput());

      await repository.deleteGroupList('group-1', 'glist-1');
      await expect(repository.deleteGroupList('group-1', 'glist-1')).resolves.toBeUndefined();

      await expect(repository.getGroupListById('group-1', 'glist-1')).resolves.toBeNull();
    });
  });
});
