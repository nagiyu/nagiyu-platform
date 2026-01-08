import '@testing-library/jest-dom';

// Mock next-auth
jest.mock('next-auth', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    handlers: {},
    auth: jest.fn(),
    signIn: jest.fn(),
    signOut: jest.fn(),
  })),
}));

// Mock auth module
jest.mock('./src/auth', () => ({
  auth: jest.fn(async () => ({
    user: {
      email: 'admin@example.com',
      roles: ['admin', 'user-manager'],
    },
  })),
  authConfig: {},
  handlers: {},
  signIn: jest.fn(),
  signOut: jest.fn(),
}));
