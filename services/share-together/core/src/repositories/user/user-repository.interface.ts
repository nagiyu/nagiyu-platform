import type { User, CreateUserInput, UpdateUserInput } from '../../types/index.js';

export interface UserRepository {
  getById(userId: string): Promise<User | null>;
  getByEmail(email: string): Promise<User | null>;
  create(input: CreateUserInput): Promise<User>;
  update(userId: string, updates: UpdateUserInput): Promise<User>;
  delete(userId: string): Promise<void>;
}
