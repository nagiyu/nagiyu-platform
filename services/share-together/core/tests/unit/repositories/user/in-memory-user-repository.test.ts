import { InMemoryUserRepository } from '../../../../src/repositories/user/in-memory-user-repository.js';
import type { CreateUserInput } from '../../../../src/types/index.js';

describe('InMemoryUserRepository', () => {
  let repository: InMemoryUserRepository;

  beforeEach(() => {
    repository = new InMemoryUserRepository();
  });

  it('ユーザーを作成してID・メールアドレスで取得できる', async () => {
    const input: CreateUserInput = {
      userId: 'user-1',
      email: 'user1@example.com',
      name: 'テストユーザー',
      image: 'https://example.com/user1.png',
      defaultListId: 'list-1',
    };

    const createdUser = await repository.create(input);
    const userById = await repository.getById('user-1');
    const userByEmail = await repository.getByEmail('user1@example.com');

    expect(createdUser.userId).toBe('user-1');
    expect(createdUser.createdAt).toBe(createdUser.updatedAt);
    expect(userById).toEqual(createdUser);
    expect(userByEmail).toEqual(createdUser);
  });

  it('ユーザー更新時にメールアドレスインデックスも更新される', async () => {
    await repository.create({
      userId: 'user-1',
      email: 'before@example.com',
      name: '更新前ユーザー',
      defaultListId: 'list-1',
    });

    const updatedUser = await repository.update('user-1', {
      email: 'after@example.com',
      name: '更新後ユーザー',
    });

    const oldEmailUser = await repository.getByEmail('before@example.com');
    const newEmailUser = await repository.getByEmail('after@example.com');

    expect(updatedUser.email).toBe('after@example.com');
    expect(updatedUser.name).toBe('更新後ユーザー');
    expect(oldEmailUser).toBeNull();
    expect(newEmailUser?.userId).toBe('user-1');
  });

  it('重複メールアドレスでユーザー作成するとエラーになる', async () => {
    await repository.create({
      userId: 'user-1',
      email: 'dup@example.com',
      name: 'ユーザー1',
      defaultListId: 'list-1',
    });

    await expect(
      repository.create({
        userId: 'user-2',
        email: 'dup@example.com',
        name: 'ユーザー2',
        defaultListId: 'list-2',
      })
    ).rejects.toThrow('メールアドレスは既に存在します');
  });

  it('ユーザー削除時にID・メールアドレスの両方で取得できなくなる', async () => {
    await repository.create({
      userId: 'user-1',
      email: 'delete@example.com',
      name: '削除対象ユーザー',
      defaultListId: 'list-1',
    });

    await repository.delete('user-1');

    await expect(repository.getById('user-1')).resolves.toBeNull();
    await expect(repository.getByEmail('delete@example.com')).resolves.toBeNull();
  });

  it('存在しないユーザーを削除してもエラーにならない', async () => {
    await expect(repository.delete('user-unknown')).resolves.toBeUndefined();
  });
});
