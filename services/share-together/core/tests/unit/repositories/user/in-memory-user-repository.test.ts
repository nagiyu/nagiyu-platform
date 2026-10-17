import {
  EntityAlreadyExistsError,
  EntityNotFoundError,
  InMemorySingleTableStore,
} from '@nagiyu/aws';
import { InMemoryUserRepository } from '../../../../src/repositories/user/in-memory-user-repository.js';
import type { CreateUserInput } from '../../../../src/types/index.js';

function buildInput(overrides: Partial<CreateUserInput> = {}): CreateUserInput {
  return {
    userId: 'user-1',
    email: 'user-1@example.com',
    name: 'ユーザー1',
    defaultListId: 'list-1',
    ...overrides,
  };
}

describe('InMemoryUserRepository', () => {
  let repository: InMemoryUserRepository;
  let store: InMemorySingleTableStore;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    repository = new InMemoryUserRepository(store);
  });

  describe('create / getById', () => {
    it('数値ミリ秒の時刻付きで作成し、取得できる', async () => {
      const before = Date.now();
      const created = await repository.create(buildInput({ image: 'https://example.com/a.png' }));

      expect(created).toMatchObject(buildInput({ image: 'https://example.com/a.png' }));
      expect(created.createdAt).toBeGreaterThanOrEqual(before);
      expect(created.updatedAt).toBeGreaterThanOrEqual(created.createdAt);
      await expect(repository.getById('user-1')).resolves.toEqual(created);
    });

    it('共有ストアに保存形式の Item を書く', async () => {
      await repository.create(buildInput());

      expect(store.get('USER#user-1', '#META#')).toMatchObject({
        Type: 'User',
        GSI2PK: 'EMAIL#user-1@example.com',
        UserID: 'user-1',
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

  describe('getByEmail', () => {
    it('メールアドレスで取得できる', async () => {
      await repository.create(buildInput());
      await repository.create(buildInput({ userId: 'user-2', email: 'user-2@example.com' }));

      const user = await repository.getByEmail('user-2@example.com');

      expect(user?.userId).toBe('user-2');
    });

    it('該当がなければ null を返す', async () => {
      await expect(repository.getByEmail('none@example.com')).resolves.toBeNull();
    });

    it('email を更新すると新しい email で引ける', async () => {
      await repository.create(buildInput());

      await repository.update('user-1', { email: 'new@example.com' });

      await expect(repository.getByEmail('user-1@example.com')).resolves.toBeNull();
      expect((await repository.getByEmail('new@example.com'))?.userId).toBe('user-1');
    });
  });

  describe('batchGetByIds', () => {
    it('見つかったものだけを返し、重複 ID は 1 件にまとめる', async () => {
      await repository.create(buildInput());
      await repository.create(buildInput({ userId: 'user-2', email: 'user-2@example.com' }));

      const users = await repository.batchGetByIds(['user-1', 'none', 'user-2', 'user-1']);

      expect(users.map((user) => user.userId)).toEqual(['user-1', 'user-2']);
    });

    it('空配列なら空を返す', async () => {
      await expect(repository.batchGetByIds([])).resolves.toEqual([]);
    });
  });

  describe('update', () => {
    it('指定した項目だけを更新し、updatedAt を進める', async () => {
      const created = await repository.create(buildInput({ image: 'https://example.com/a.png' }));

      const updated = await repository.update('user-1', { name: '新しい名前' });

      expect(updated).toMatchObject({
        name: '新しい名前',
        email: created.email,
        image: created.image,
        createdAt: created.createdAt,
      });
      expect(updated.updatedAt).toBeGreaterThanOrEqual(created.updatedAt);
    });

    it('image が null のときは画像を削除する', async () => {
      await repository.create(buildInput({ image: 'https://example.com/a.png' }));

      const updated = await repository.update('user-1', { image: null as unknown as undefined });

      expect(updated.image).toBeUndefined();
    });

    it('存在しない場合は EntityNotFoundError をスローする', async () => {
      await expect(repository.update('none', { name: 'n' })).rejects.toThrow(EntityNotFoundError);
    });
  });

  describe('delete', () => {
    it('削除すると取得できなくなる', async () => {
      await repository.create(buildInput());

      await repository.delete('user-1');

      await expect(repository.getById('user-1')).resolves.toBeNull();
      await expect(repository.getByEmail('user-1@example.com')).resolves.toBeNull();
    });

    it('存在しない場合は EntityNotFoundError をスローする', async () => {
      await expect(repository.delete('none')).rejects.toThrow(EntityNotFoundError);
    });
  });
});
