/**
 * Unit tests for POST /api/billing/webhook endpoint
 *
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import { POST } from '../../../../../src/app/api/billing/webhook/route';

const mockGetBillingConfig = jest.fn();
const mockConstructEvent = jest.fn();
const mockSync = jest.fn();
const mockReportErrorEvent = jest.fn().mockResolvedValue(null);

jest.mock('@nagiyu/auth-core', () => ({
  BILLING_ERROR_MESSAGES: {
    BILLING_DISABLED: '課金は有効になっていません',
    INVALID_SIGNATURE: '通知の署名を検証できませんでした',
    CUSTOMER_LOOKUP_FAILED: 'Stripe の顧客を取得できませんでした',
  },
  getBillingConfig: () => mockGetBillingConfig(),
  createBillingStripe: jest.fn(() => ({
    webhooks: { constructEvent: (...args: unknown[]) => mockConstructEvent(...args) },
  })),
  createUserRepository: jest.fn(() => ({ marker: 'repo' })),
  extractCustomerId: (event: { data: { object: { customer?: string } } }) =>
    event.data.object.customer ?? null,
  syncStripeCustomer: (...args: unknown[]) => mockSync(...args),
}));

jest.mock('@nagiyu/aws', () => ({
  ...jest.requireActual('@nagiyu/aws'),
  reportErrorEvent: (...args: unknown[]) => mockReportErrorEvent(...args),
}));

function buildRequest(headers: Record<string, string> = { 'stripe-signature': 'sig' }) {
  return new NextRequest('http://localhost/api/billing/webhook', {
    method: 'POST',
    body: '{"raw":true}',
    headers,
  });
}

describe('POST /api/billing/webhook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReportErrorEvent.mockResolvedValue(null);
    mockGetBillingConfig.mockReturnValue({ secretKey: 'sk', webhookSecret: 'whsec' });
    mockSync.mockResolvedValue({ synced: true, changed: true });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('課金が無効なら 503 を返す', async () => {
    mockGetBillingConfig.mockReturnValue(null);

    const response = await POST(buildRequest());

    expect(response.status).toBe(503);
    expect(mockConstructEvent).not.toHaveBeenCalled();
  });

  it('署名ヘッダーがなければ 400 を返す', async () => {
    const response = await POST(buildRequest({}));

    expect(response.status).toBe(400);
    expect(mockSync).not.toHaveBeenCalled();
  });

  it('署名の検証に失敗したら 400 を返し、同期しない', async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error('bad signature');
    });

    const response = await POST(buildRequest());

    expect(response.status).toBe(400);
    expect(mockSync).not.toHaveBeenCalled();
  });

  it('加工していない本文と署名で検証し、顧客を同期して 200 を返す', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'customer.subscription.updated',
      data: { object: { customer: 'cus_1' } },
    });

    const response = await POST(buildRequest());

    expect(response.status).toBe(200);
    expect(mockConstructEvent).toHaveBeenCalledWith('{"raw":true}', 'sig', 'whsec');
    expect(mockSync).toHaveBeenCalledWith(
      expect.objectContaining({ stripe: expect.anything() }),
      'cus_1'
    );
  });

  it('顧客 ID を取り出せないイベントは 200 で無視する', async () => {
    mockConstructEvent.mockReturnValue({ type: 'ping', data: { object: {} } });

    const response = await POST(buildRequest());

    expect(response.status).toBe(200);
    expect(mockSync).not.toHaveBeenCalled();
  });

  it('同期が失敗したら 500 を返して再送させる', async () => {
    mockConstructEvent.mockReturnValue({ type: 'x', data: { object: { customer: 'cus_1' } } });
    mockSync.mockRejectedValue(new Error('dynamodb down'));

    const response = await POST(buildRequest());

    expect(response.status).toBe(500);
  });
});
