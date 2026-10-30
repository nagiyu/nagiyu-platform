/**
 * @jest-environment node
 */
import { GET } from '@/app/api/notify/vapid-key/route';
import { errorReporter } from '@/lib/api-error-reporting';

jest.mock('@/lib/api-error-reporting', () => ({
  errorReporter: {
    report: jest.fn(),
    onError: jest.fn(() => jest.fn()),
  },
}));

/**
 * ルート読み込み時に onError へ渡された報告関数を控える。
 * beforeEach のモックのリセットで呼び出し履歴が消えるため、ここで取り出しておく。
 */
const onErrorMock = errorReporter.onError as jest.Mock;
const onErrorTitle = onErrorMock.mock.calls[0][0] as string;
const onErrorHandler = onErrorMock.mock.results[0].value as jest.Mock;

describe('GET /api/notify/vapid-key', () => {
  const original = process.env.VAPID_PUBLIC_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (original === undefined) {
      delete process.env.VAPID_PUBLIC_KEY;
    } else {
      process.env.VAPID_PUBLIC_KEY = original;
    }
  });

  it('公開鍵が設定されていれば 200 を返し、報告しない', async () => {
    process.env.VAPID_PUBLIC_KEY = 'public-key';

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ publicKey: 'public-key' });
    expect(onErrorHandler).not.toHaveBeenCalled();
  });

  it('公開鍵が未設定なら 500 を返し、報告する', async () => {
    delete process.env.VAPID_PUBLIC_KEY;

    const response = await GET();

    expect(response.status).toBe(500);
    expect(onErrorTitle).toBe('Web API: VAPID 公開鍵取得エラー');
    expect(onErrorHandler).toHaveBeenCalledTimes(1);
  });
});
