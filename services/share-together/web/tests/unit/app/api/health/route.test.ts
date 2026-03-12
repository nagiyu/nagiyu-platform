jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

import { GET } from '@/app/api/health/route';

describe('GET /api/health', () => {
  it('サービス稼働状態を返す', async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: 'ok',
      service: 'share-together',
      version: '1.0.0',
    });
    expect(body).toHaveProperty('timestamp');
  });
});
