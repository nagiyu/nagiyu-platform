import {
  EntityAlreadyExistsError,
  EntityNotFoundError,
  InMemorySingleTableStore,
} from '@nagiyu/aws';
import { InMemoryGroupRepository } from '../../../../src/repositories/group/in-memory-group-repository.js';
import type { CreateGroupInput } from '../../../../src/types/index.js';

function buildInput(overrides: Partial<CreateGroupInput> = {}): CreateGroupInput {
  return {
    groupId: 'group-1',
    name: 'グループ1',
    ownerUserId: 'owner-1',
    ...overrides,
  };
}

describe('InMemoryGroupRepository', () => {
  let repository: InMemoryGroupRepository;
  let store: InMemorySingleTableStore;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    repository = new InMemoryGroupRepository(store);
  });

  describe('create / getById', () => {
    it('数値ミリ秒の時刻付きで作成し、取得できる', async () => {
      const before = Date.now();
      const created = await repository.create(buildInput());

      expect(created).toMatchObject(buildInput());
      expect(created.createdAt).toBeGreaterThanOrEqual(before);
      expect(created.updatedAt).toBeGreaterThanOrEqual(created.createdAt);
      await expect(repository.getById('group-1')).resolves.toEqual(created);
    });

    it('共有ストアに保存形式の Item を書く', async () => {
      await repository.create(buildInput());

      expect(store.get('GROUP#group-1', '#META#')).toMatchObject({
        Type: 'Group',
        GroupID: 'group-1',
        OwnerUserID: 'owner-1',
      });
    });

    it('同じ ID を作成すると EntityAlreadyExistsError をスローする', async () => {
      await repository.create(buildInput());
      await expect(repository.create(buildInput())).rejects.toThrow(EntityAlreadyExistsError);
    });

    it('存在しない ID は null を返す', async () => {
      await expect(repository.getById('none')).resolves.toBeNull();
    });
  });

  describe('batchGetByIds', () => {
    it('見つかったものだけを返し、重複 ID は 1 件にまとめる', async () => {
      await repository.create(buildInput());
      await repository.create(buildInput({ groupId: 'group-2' }));

      const groups = await repository.batchGetByIds(['group-1', 'none', 'group-2', 'group-1']);

      expect(groups.map((group) => group.groupId)).toEqual(['group-1', 'group-2']);
    });

    it('空配列なら空を返す', async () => {
      await expect(repository.batchGetByIds([])).resolves.toEqual([]);
    });
  });

  describe('update', () => {
    it('指定した項目だけを更新し、updatedAt を進める', async () => {
      const created = await repository.create(buildInput());

      const updated = await repository.update('group-1', { name: '新しい名前' });

      expect(updated).toMatchObject({
        name: '新しい名前',
        ownerUserId: created.ownerUserId,
        createdAt: created.createdAt,
      });
      expect(updated.updatedAt).toBeGreaterThanOrEqual(created.updatedAt);
    });

    it('存在しない場合は EntityNotFoundError をスローする', async () => {
      await expect(repository.update('none', { name: 'n' })).rejects.toThrow(EntityNotFoundError);
    });
  });

  describe('delete', () => {
    it('削除すると取得できなくなる', async () => {
      await repository.create(buildInput());

      await repository.delete('group-1');

      await expect(repository.getById('group-1')).resolves.toBeNull();
    });

    it('存在しない場合は EntityNotFoundError をスローする', async () => {
      await expect(repository.delete('none')).rejects.toThrow(EntityNotFoundError);
    });
  });
});
