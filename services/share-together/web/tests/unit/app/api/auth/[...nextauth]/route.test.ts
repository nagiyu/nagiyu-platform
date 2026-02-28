const mockGet = jest.fn();
const mockPost = jest.fn();

jest.mock('../../../../../../auth', () => ({
  handlers: {
    GET: mockGet,
    POST: mockPost,
  },
}));

import { GET, POST } from '@/app/api/auth/[...nextauth]/route';

describe('/api/auth/[...nextauth] route', () => {
  it('NextAuth handlers を GET/POST に公開する', () => {
    expect(GET).toBe(mockGet);
    expect(POST).toBe(mockPost);
  });
});
