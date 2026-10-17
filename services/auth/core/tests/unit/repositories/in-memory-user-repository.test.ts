import { EntityNotFoundError, InMemorySingleTableStore } from '@nagiyu/aws';
import { InMemoryUserRepository } from '../../../src/repositories/in-memory-user-repository';

describe('InMemoryUserRepository', () => {
  let store: InMemorySingleTableStore;
  let repository: InMemoryUserRepository;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    repository = new InMemoryUserRepository(store);
  });

  it('ストアを省略しても動作する', async () => {
    const standalone = new InMemoryUserRepository();

    const created = await standalone.upsertUser({
      googleId: 'google-1',
      email: 'a@example.com',
      name: 'A',
    });

    expect(await standalone.getUserById(created.userId)).toEqual(created);
  });

  it('ユーザーを保存形式 (PascalCase・数値ミリ秒) でストアに書く', async () => {
    const created = await repository.upsertUser({
      googleId: 'google-1',
      email: 'a@example.com',
      name: 'A',
      picture: 'https://example.com/a.png',
    });

    expect(store.getByKey({ userId: created.userId })).toMatchObject({
      userId: created.userId,
      googleId: 'google-1',
      Type: 'User',
      Email: 'a@example.com',
      Name: 'A',
      Picture: 'https://example.com/a.png',
      Roles: [],
      CreatedAt: created.createdAt,
      UpdatedAt: created.updatedAt,
    });
  });

  it('Google ID で引き当て、なければ null を返す', async () => {
    const created = await repository.upsertUser({
      googleId: 'google-1',
      email: 'a@example.com',
      name: 'A',
    });

    expect(await repository.getUserByGoogleId('google-1')).toEqual(created);
    expect(await repository.getUserByGoogleId('google-none')).toBeNull();
  });

  it('既存の Google ID で upsert すると新規作成せず name と picture を更新する', async () => {
    const created = await repository.upsertUser({
      googleId: 'google-1',
      email: 'a@example.com',
      name: 'A',
      picture: 'https://example.com/a.png',
    });

    const updated = await repository.upsertUser({
      googleId: 'google-1',
      email: 'a@example.com',
      name: 'A2',
    });

    expect(updated.userId).toBe(created.userId);
    expect(updated.name).toBe('A2');
    expect(updated).not.toHaveProperty('picture');
    expect(store.size()).toBe(1);
  });

  it('listUsers は limit と lastEvaluatedKey でページングする', async () => {
    for (const suffix of ['1', '2', '3']) {
      await repository.upsertUser({
        googleId: `google-${suffix}`,
        email: `${suffix}@example.com`,
        name: suffix,
      });
    }

    const first = await repository.listUsers(2);
    expect(first.users).toHaveLength(2);
    expect(first.lastEvaluatedKey).toBeDefined();

    const second = await repository.listUsers(2, first.lastEvaluatedKey);
    expect(second.users).toHaveLength(1);
    expect(second.lastEvaluatedKey).toBeUndefined();
  });

  it('listUsers は引数を省略すると全件を返す', async () => {
    await repository.upsertUser({ googleId: 'google-1', email: 'a@example.com', name: 'A' });

    const result = await repository.listUsers();

    expect(result.users).toHaveLength(1);
    expect(result.lastEvaluatedKey).toBeUndefined();
  });

  it('assignRoles と updateLastLogin で更新できる', async () => {
    const created = await repository.upsertUser({
      googleId: 'google-1',
      email: 'a@example.com',
      name: 'A',
    });

    const assigned = await repository.assignRoles(created.userId, ['admin']);
    await repository.updateLastLogin(created.userId);

    expect(assigned.roles).toEqual(['admin']);
    expect((await repository.getUserById(created.userId))?.lastLoginAt).toEqual(expect.any(Number));
  });

  it('deleteUser で削除でき、GSI の引き当てからも消える', async () => {
    const created = await repository.upsertUser({
      googleId: 'google-1',
      email: 'a@example.com',
      name: 'A',
    });

    await repository.deleteUser(created.userId);

    expect(await repository.getUserById(created.userId)).toBeNull();
    expect(await repository.getUserByGoogleId('google-1')).toBeNull();
  });

  it('存在しないユーザーの更新・削除は EntityNotFoundError になる', async () => {
    await expect(repository.updateUser('none', { name: 'x' })).rejects.toBeInstanceOf(
      EntityNotFoundError
    );
    await expect(repository.assignRoles('none', [])).rejects.toBeInstanceOf(EntityNotFoundError);
    await expect(repository.updateLastLogin('none')).rejects.toBeInstanceOf(EntityNotFoundError);
    await expect(repository.deleteUser('none')).rejects.toBeInstanceOf(EntityNotFoundError);
  });
});
