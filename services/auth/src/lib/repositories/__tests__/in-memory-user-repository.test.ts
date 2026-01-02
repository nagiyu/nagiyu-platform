import { InMemoryUserRepository } from '@/lib/repositories/in-memory-user-repository';
import type { UpsertUserInput } from '@/lib/repositories/user-repository';

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
});
