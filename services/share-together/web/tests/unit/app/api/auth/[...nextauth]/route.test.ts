const mockGet = jest.fn();
const mockPost = jest.fn();

jest.mock('next-auth', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    handlers: {
      GET: mockGet,
      POST: mockPost,
    },
    auth: jest.fn(),
    signIn: jest.fn(),
    signOut: jest.fn(),
  })),
}));

import { GET, POST } from '@/app/api/auth/[...nextauth]/route';

describe('/api/auth/[...nextauth] route', () => {
  it('NextAuth handlers を GET/POST に公開する', () => {
    expect(GET).toBe(mockGet);
    expect(POST).toBe(mockPost);
  });
});
