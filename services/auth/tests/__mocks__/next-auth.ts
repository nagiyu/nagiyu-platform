// Mock next-auth module
const mockAuth = jest.fn();
const mockSignIn = jest.fn();
const mockSignOut = jest.fn();
const mockHandlers = { GET: jest.fn(), POST: jest.fn() };

export const NextAuth = jest.fn(() => ({
  handlers: mockHandlers,
  auth: mockAuth,
  signIn: mockSignIn,
  signOut: mockSignOut,
}));

export default NextAuth;

// Re-export commonly used types (these don't need implementation for mocks)
export type { NextAuthConfig } from '@auth/core/types';
