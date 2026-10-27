import { GET } from '@/app/api/health/route';

describe('GET /api/health', () => {
  it('サービス名を含むヘルスチェック結果を返す', async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({ service: 'codec-converter' }));
  });
});
