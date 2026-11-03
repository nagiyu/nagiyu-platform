import { EntityNotFoundError, InMemorySingleTableStore, OptimisticLockError } from '@nagiyu/aws';
import type { RoleGrant } from '@nagiyu/common';
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

  it('listUsers は limit と cursor でページングする', async () => {
    for (const suffix of ['1', '2', '3']) {
      await repository.upsertUser({
        googleId: `google-${suffix}`,
        email: `${suffix}@example.com`,
        name: suffix,
      });
    }

    const first = await repository.listUsers({ limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBeDefined();

    const second = await repository.listUsers({ limit: 2, cursor: first.nextCursor });
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeUndefined();
  });

  it('listUsers は引数を省略すると全件を返す', async () => {
    await repository.upsertUser({ googleId: 'google-1', email: 'a@example.com', name: 'A' });

    const result = await repository.listUsers();

    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBeUndefined();
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

  describe('updateRolesAndGrants', () => {
    const GRANT: RoleGrant = {
      grantId: 'grant-1',
      roleId: 'stock-user',
      source: 'manual',
      expiresAt: 4_000_000_000_000,
      createdAt: 1,
      updatedAt: 1,
    };

    async function createUser() {
      return repository.upsertUser({ googleId: 'google-1', email: 'a@example.com', name: 'A' });
    }

    it('手動ロールと権利を 1 回でまとめて書き換える', async () => {
      const created = await createUser();

      const updated = await repository.updateRolesAndGrants(created.userId, () => ({
        roles: ['admin'],
        roleGrants: [GRANT],
      }));

      expect(updated.roles).toEqual(['admin']);
      expect(updated.roleGrants).toEqual([GRANT]);
      expect(await repository.getUserById(created.userId)).toEqual(updated);
    });

    it('省略した項目は変更しない', async () => {
      const created = await createUser();
      await repository.updateRolesAndGrants(created.userId, () => ({
        roles: ['admin'],
        roleGrants: [GRANT],
      }));

      const onlyRoles = await repository.updateRolesAndGrants(created.userId, (user) => ({
        roles: [...user.roles, 'user-manager'],
      }));

      expect(onlyRoles.roles).toEqual(['admin', 'user-manager']);
      expect(onlyRoles.roleGrants).toEqual([GRANT]);
    });

    it('compute には現在のユーザーを渡す', async () => {
      const created = await createUser();
      const compute = jest.fn(() => ({}));

      await repository.updateRolesAndGrants(created.userId, compute);

      expect(compute).toHaveBeenCalledWith(expect.objectContaining({ userId: created.userId }));
    });

    it('競合したら読み直してやり直す', async () => {
      const created = await createUser();
      const raw = store.getByKey({ userId: created.userId }) as Record<string, unknown>;
      const seenRoles: string[][] = [];

      const updated = await repository.updateRolesAndGrants(created.userId, (user) => {
        seenRoles.push(user.roles);
        if (seenRoles.length === 1) {
          // 読んだ後に別の書き込みが先に入った状況を作る
          store.putByKey(
            { userId: created.userId },
            { ...raw, Roles: ['other'], UpdatedAt: 1_800_000_000_000 }
          );
        }
        return { roles: [...user.roles, 'mine'] };
      });

      expect(seenRoles).toEqual([[], ['other']]);
      expect(updated.roles).toEqual(['other', 'mine']);
    });

    it('存在しないユーザーは EntityNotFoundError になる', async () => {
      await expect(repository.updateRolesAndGrants('none', () => ({}))).rejects.toBeInstanceOf(
        EntityNotFoundError
      );
    });

    it('compute の例外はそのまま伝える', async () => {
      const created = await createUser();

      await expect(
        repository.updateRolesAndGrants(created.userId, () => {
          throw new Error('検証エラー');
        })
      ).rejects.toThrow('検証エラー');
    });

    it('競合が解けなければ OptimisticLockError になる', async () => {
      const created = await createUser();
      const raw = store.getByKey({ userId: created.userId }) as Record<string, unknown>;
      let calls = 0;

      await expect(
        repository.updateRolesAndGrants(created.userId, () => {
          calls += 1;
          // 計算のたびに別の書き込みが先に入ったことにする
          store.putByKey(
            { userId: created.userId },
            { ...raw, UpdatedAt: 1_800_000_000_000 + calls }
          );
          return { roles: ['admin'] };
        })
      ).rejects.toBeInstanceOf(OptimisticLockError);
      expect(calls).toBe(3);
    });
  });

  describe('updateRolesAndGrantsIfUnchanged', () => {
    async function createUser() {
      return repository.upsertUser({ googleId: 'google-1', email: 'a@example.com', name: 'A' });
    }

    it('読んだ updatedAt が合っていれば 1 回で書く', async () => {
      const created = await createUser();

      const updated = await repository.updateRolesAndGrantsIfUnchanged(
        created.userId,
        { roles: ['admin'] },
        created.updatedAt
      );

      expect(updated.roles).toEqual(['admin']);
    });

    it('読んだ後に別の書き込みがあれば書かず、OptimisticLockError にする', async () => {
      const created = await createUser();
      const raw = store.getByKey({ userId: created.userId }) as Record<string, unknown>;
      store.putByKey({ userId: created.userId }, { ...raw, UpdatedAt: created.updatedAt + 10 });

      await expect(
        repository.updateRolesAndGrantsIfUnchanged(
          created.userId,
          { roles: ['admin'] },
          created.updatedAt
        )
      ).rejects.toBeInstanceOf(OptimisticLockError);
      expect((await repository.getUserById(created.userId))?.roles).toEqual([]);
    });

    it('UpdatedAt が旧形式なら、競合の後に今の形へ書き直して読み直しで書ける状態にする', async () => {
      const created = await createUser();
      const raw = { ...(store.getByKey({ userId: created.userId }) as Record<string, unknown>) };
      delete raw.UpdatedAt;
      raw.updatedAt = '2024-01-01T00:00:00.000Z';
      store.putByKey({ userId: created.userId }, raw);

      await expect(
        repository.updateRolesAndGrantsIfUnchanged(created.userId, { roles: ['admin'] }, 0)
      ).rejects.toBeInstanceOf(OptimisticLockError);

      const reread = await repository.getUserById(created.userId);
      const updated = await repository.updateRolesAndGrantsIfUnchanged(
        created.userId,
        { roles: ['admin'] },
        reread?.updatedAt as number
      );
      expect(updated.roles).toEqual(['admin']);
    });

    it('存在しないユーザーは EntityNotFoundError になる', async () => {
      await expect(
        repository.updateRolesAndGrantsIfUnchanged('none', {}, 1)
      ).rejects.toBeInstanceOf(EntityNotFoundError);
    });
  });
});
