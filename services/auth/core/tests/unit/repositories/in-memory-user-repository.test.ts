import { InMemoryUserRepository } from '../../../src/repositories/in-memory-user-repository';
import { UserNotFoundError, type UpsertUserInput } from '../../../src/repositories/user-repository';

describe('InMemoryUserRepository', () => {
  let repository: InMemoryUserRepository;

  beforeEach(() => {
    repository = new InMemoryUserRepository();
  });

  describe('getUserByGoogleId', () => {
    it('存在しないGoogle IDの場合はnullを返す', async () => {
      const result = await repository.getUserByGoogleId('non-existent');
      expect(result).toBeNull();
    });

    it('存在するGoogle IDの場合はユーザーを返す', async () => {
      const input: UpsertUserInput = {
        googleId: 'google123',
        email: 'test@example.com',
        name: 'Test User',
      };
      await repository.upsertUser(input);

      const result = await repository.getUserByGoogleId('google123');
      expect(result).not.toBeNull();
      expect(result?.googleId).toBe('google123');
      expect(result?.email).toBe('test@example.com');
    });
  });

  describe('getUserById', () => {
    it('存在しないユーザーIDの場合はnullを返す', async () => {
      const result = await repository.getUserById('non-existent');
      expect(result).toBeNull();
    });

    it('存在するユーザーIDの場合はユーザーを返す', async () => {
      const input: UpsertUserInput = {
        googleId: 'google123',
        email: 'test@example.com',
        name: 'Test User',
      };
      const user = await repository.upsertUser(input);

      const result = await repository.getUserById(user.userId);
      expect(result).not.toBeNull();
      expect(result?.userId).toBe(user.userId);
    });
  });

  describe('upsertUser', () => {
    it('新規ユーザーを作成する', async () => {
      const input: UpsertUserInput = {
        googleId: 'google123',
        email: 'test@example.com',
        name: 'Test User',
        picture: 'https://example.com/avatar.jpg',
      };

      const result = await repository.upsertUser(input);

      expect(result.userId).toBeDefined();
      expect(result.googleId).toBe('google123');
      expect(result.email).toBe('test@example.com');
      expect(result.name).toBe('Test User');
      expect(result.picture).toBe('https://example.com/avatar.jpg');
      expect(result.roles).toEqual([]);
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });

    it('既存ユーザーを更新する', async () => {
      const input: UpsertUserInput = {
        googleId: 'google123',
        email: 'test@example.com',
        name: 'Test User',
      };
      const user = await repository.upsertUser(input);

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updateInput: UpsertUserInput = {
        googleId: 'google123',
        email: 'updated@example.com',
        name: 'Updated Name',
      };
      const updatedUser = await repository.upsertUser(updateInput);

      expect(updatedUser.userId).toBe(user.userId);
      expect(updatedUser.email).toBe('updated@example.com');
      expect(updatedUser.name).toBe('Updated Name');
      expect(updatedUser.createdAt).toBe(user.createdAt);
      expect(updatedUser.updatedAt).not.toBe(user.updatedAt);
    });
  });

  describe('updateLastLogin', () => {
    it('最終ログイン日時を更新する', async () => {
      const input: UpsertUserInput = {
        googleId: 'google123',
        email: 'test@example.com',
        name: 'Test User',
      };
      const user = await repository.upsertUser(input);

      expect(user.lastLoginAt).toBeUndefined();

      await repository.updateLastLogin(user.userId);

      const updatedUser = await repository.getUserById(user.userId);
      expect(updatedUser?.lastLoginAt).toBeDefined();
    });

    it('存在しないユーザーIDの場合は何もしない', async () => {
      await expect(repository.updateLastLogin('non-existent')).resolves.not.toThrow();
    });
  });

  describe('listUsers', () => {
    const seedUsers = async (count: number) => {
      const created: { userId: string; googleId: string }[] = [];
      for (let i = 0; i < count; i += 1) {
        const user = await repository.upsertUser({
          googleId: `google-${i}`,
          email: `user${i}@example.com`,
          name: `User ${i}`,
        });
        created.push({ userId: user.userId, googleId: user.googleId });
      }
      return created;
    };

    it('ユーザーがいない場合は空配列と undefined の lastEvaluatedKey を返す', async () => {
      const result = await repository.listUsers();
      expect(result.users).toEqual([]);
      expect(result.lastEvaluatedKey).toBeUndefined();
    });

    it('全ユーザーを返し、最終ページでは lastEvaluatedKey が undefined になる', async () => {
      await seedUsers(3);
      const result = await repository.listUsers();
      expect(result.users).toHaveLength(3);
      expect(result.lastEvaluatedKey).toBeUndefined();
    });

    it('limit を超える場合は lastEvaluatedKey が返り、次ページで残りを取得できる', async () => {
      const seeded = await seedUsers(5);
      const first = await repository.listUsers(2);
      expect(first.users).toHaveLength(2);
      expect(first.lastEvaluatedKey).toEqual({ userId: seeded[1].userId });

      const second = await repository.listUsers(2, first.lastEvaluatedKey);
      expect(second.users).toHaveLength(2);
      expect(second.lastEvaluatedKey).toEqual({ userId: seeded[3].userId });

      const third = await repository.listUsers(2, second.lastEvaluatedKey);
      expect(third.users).toHaveLength(1);
      expect(third.lastEvaluatedKey).toBeUndefined();
    });
  });

  describe('updateUser', () => {
    it('指定ユーザーの name を更新する', async () => {
      const user = await repository.upsertUser({
        googleId: 'google123',
        email: 'test@example.com',
        name: 'Test User',
      });

      await new Promise((resolve) => setTimeout(resolve, 10));
      const updated = await repository.updateUser(user.userId, { name: 'Updated' });

      expect(updated.userId).toBe(user.userId);
      expect(updated.name).toBe('Updated');
      expect(updated.updatedAt).not.toBe(user.updatedAt);
    });

    it('roles のみを更新できる', async () => {
      const user = await repository.upsertUser({
        googleId: 'google123',
        email: 'test@example.com',
        name: 'Test User',
      });

      const updated = await repository.updateUser(user.userId, { roles: ['admin'] });

      expect(updated.roles).toEqual(['admin']);
      expect(updated.name).toBe('Test User');
    });

    it('存在しない userId の場合は UserNotFoundError を投げる', async () => {
      await expect(repository.updateUser('non-existent', { name: 'X' })).rejects.toBeInstanceOf(
        UserNotFoundError
      );
    });
  });

  describe('deleteUser', () => {
    it('ユーザーを削除し getUserById で null を返す', async () => {
      const user = await repository.upsertUser({
        googleId: 'google123',
        email: 'test@example.com',
        name: 'Test User',
      });

      await repository.deleteUser(user.userId);

      expect(await repository.getUserById(user.userId)).toBeNull();
      expect(await repository.getUserByGoogleId('google123')).toBeNull();
    });

    it('存在しないユーザーIDでも例外を投げない', async () => {
      await expect(repository.deleteUser('non-existent')).resolves.not.toThrow();
    });
  });

  describe('assignRoles', () => {
    it('指定ユーザーにロールを割り当てる', async () => {
      const user = await repository.upsertUser({
        googleId: 'google123',
        email: 'test@example.com',
        name: 'Test User',
      });

      const updated = await repository.assignRoles(user.userId, ['admin', 'editor']);

      expect(updated.roles).toEqual(['admin', 'editor']);
    });

    it('存在しない userId の場合は UserNotFoundError を投げる', async () => {
      await expect(repository.assignRoles('non-existent', ['admin'])).rejects.toBeInstanceOf(
        UserNotFoundError
      );
    });
  });
});
