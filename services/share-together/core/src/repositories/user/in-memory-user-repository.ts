import type { CreateUserInput, UpdateUserInput, User } from '../../types/index.js';
import type { UserRepository } from './user-repository.interface.js';

const ERROR_MESSAGES = {
  USER_NOT_FOUND: 'ユーザーが見つかりません',
  USER_ALREADY_EXISTS: 'ユーザーは既に存在します',
  EMAIL_ALREADY_EXISTS: 'メールアドレスは既に存在します',
} as const;

export class InMemoryUserRepository implements UserRepository {
  private readonly users = new Map<string, User>();
  private readonly userIdByEmail = new Map<string, string>();

  public async getById(userId: string): Promise<User | null> {
    const user = this.users.get(userId);
    return user ? { ...user } : null;
  }

  public async getByEmail(email: string): Promise<User | null> {
    const userId = this.userIdByEmail.get(email);
    if (!userId) {
      return null;
    }

    const user = this.users.get(userId);
    return user ? { ...user } : null;
  }

  public async create(input: CreateUserInput): Promise<User> {
    if (this.users.has(input.userId)) {
      throw new Error(ERROR_MESSAGES.USER_ALREADY_EXISTS);
    }
    if (this.userIdByEmail.has(input.email)) {
      throw new Error(ERROR_MESSAGES.EMAIL_ALREADY_EXISTS);
    }

    const now = new Date().toISOString();
    const user: User = {
      ...input,
      createdAt: now,
      updatedAt: now,
    };

    this.users.set(user.userId, user);
    this.userIdByEmail.set(user.email, user.userId);
    return { ...user };
  }

  public async update(userId: string, updates: UpdateUserInput): Promise<User> {
    const existingUser = this.users.get(userId);
    if (!existingUser) {
      throw new Error(ERROR_MESSAGES.USER_NOT_FOUND);
    }

    if (updates.email && updates.email !== existingUser.email) {
      const existingUserIdWithEmail = this.userIdByEmail.get(updates.email);
      if (existingUserIdWithEmail && existingUserIdWithEmail !== userId) {
        throw new Error(ERROR_MESSAGES.EMAIL_ALREADY_EXISTS);
      }

      this.userIdByEmail.delete(existingUser.email);
      this.userIdByEmail.set(updates.email, userId);
    }

    const updatedUser: User = {
      ...existingUser,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    this.users.set(userId, updatedUser);
    return { ...updatedUser };
  }

  public async delete(userId: string): Promise<void> {
    const existingUser = this.users.get(userId);
    if (!existingUser) {
      return;
    }

    this.users.delete(userId);
    this.userIdByEmail.delete(existingUser.email);
  }
}
