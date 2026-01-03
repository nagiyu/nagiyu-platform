export interface User {
  userId: string; // UUID (Primary Key)
  googleId: string; // Google OAuth ID
  email: string;
  name: string;
  picture?: string;
  roles: string[]; // ['admin', 'user-manager']
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  lastLoginAt?: string; // ISO 8601
}

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
