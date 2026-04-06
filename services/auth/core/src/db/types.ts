export type { User } from '@nagiyu/common';

export interface CreateUserInput {
  googleId: string;
  email: string;
  name: string;
  picture?: string;
}

export interface UpdateUserInput {
  name?: string;
  picture?: string;
  roles?: string[];
}
