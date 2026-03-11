import { describe, it, expect } from '@jest/globals';
import { createHealthRoute } from '../../src/health';

describe('createHealthRoute', () => {
  it('オプションなしでヘルスレスポンスを返す', async () => {
    const GET = createHealthRoute();
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: 'ok',
    });
    expect(typeof body.timestamp).toBe('string');
  });

  it('service/version オプションをレスポンスに含める', async () => {
    const GET = createHealthRoute({
      service: 'test-service',
      version: '1.2.3',
    });
    const response = await GET();
    const body = await response.json();

    expect(body).toMatchObject({
      status: 'ok',
      service: 'test-service',
      version: '1.2.3',
    });
  });
});
