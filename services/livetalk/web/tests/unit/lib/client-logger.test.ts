import { reportClientError } from '@/lib/client-logger';

const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({ ok: true, status: 204 });

  // matchMedia のデフォルト（standalone でない）
  window.matchMedia = jest.fn().mockReturnValue({ matches: false });

  // navigator.standalone をリセット
  Object.defineProperty(window.navigator, 'standalone', {
    value: undefined,
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('reportClientError', () => {
  it('fetch を POST /api/client-log に対して呼ぶ', () => {
    reportClientError('error', 'テストエラー', 'エラー詳細');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/client-log');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('正しいペイロードで fetch を呼ぶ', () => {
    reportClientError('warning', '音声エラー', 'decode failed', {
      screen: 'chat',
      audioContextState: 'suspended',
      sentenceReceived: 3,
    });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;

    expect(body.severity).toBe('warning');
    expect(body.title).toBe('音声エラー');
    expect(body.message).toBe('decode failed');
    expect(typeof body.occurredAt).toBe('string');

    const ctx = body.context as Record<string, unknown>;
    expect(ctx.screen).toBe('chat');
    expect(ctx.audioContextState).toBe('suspended');
    expect(ctx.sentenceReceived).toBe(3);
  });

  it('context を省略しても fetch を呼ぶ', () => {
    reportClientError('critical', 'タイトル', 'メッセージ');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.severity).toBe('critical');
  });

  it('fetch 失敗は握りつぶされてアプリを止めない', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network error'));

    expect(() => reportClientError('error', 'タイトル', 'メッセージ')).not.toThrow();
    // Promise 内のエラーが uncaught rejection にならないことを確認するため少し待つ
    await Promise.resolve();
  });

  it('baseContext に userAgent と standalone が含まれる', () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'TestAgent/1.0',
      configurable: true,
    });
    window.matchMedia = jest.fn().mockReturnValue({ matches: false });

    reportClientError('error', 'タイトル', 'メッセージ');

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    const ctx = body.context as Record<string, unknown>;
    expect(ctx.userAgent).toBe('TestAgent/1.0');
    expect(ctx.standalone).toBe(false);
  });

  it('standalone: matchMedia が true のとき standalone: true になる', () => {
    window.matchMedia = jest.fn().mockReturnValue({ matches: true });

    reportClientError('error', 'タイトル', 'メッセージ');

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    const ctx = body.context as Record<string, unknown>;
    expect(ctx.standalone).toBe(true);
  });

  it('standalone: navigator.standalone が true のとき standalone: true になる', () => {
    window.matchMedia = jest.fn().mockReturnValue({ matches: false });
    Object.defineProperty(window.navigator, 'standalone', {
      value: true,
      configurable: true,
    });

    reportClientError('error', 'タイトル', 'メッセージ');

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    const ctx = body.context as Record<string, unknown>;
    expect(ctx.standalone).toBe(true);
  });

  it('matchMedia が undefined でも例外を投げず standalone: false になる', () => {
    // @ts-expect-error テスト用
    window.matchMedia = undefined;

    expect(() => reportClientError('error', 'タイトル', 'メッセージ')).not.toThrow();
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    const ctx = body.context as Record<string, unknown>;
    expect(ctx.standalone).toBe(false);

    // restore
    window.matchMedia = jest.fn().mockReturnValue({ matches: false });
  });

  it('渡した context が baseContext にマージされる', () => {
    reportClientError('warning', 'タイトル', 'メッセージ', {
      screen: 'chat',
      streamDone: true,
    });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    const ctx = body.context as Record<string, unknown>;
    expect(ctx.screen).toBe('chat');
    expect(ctx.streamDone).toBe(true);
    // baseContext のキーも入っている
    expect('userAgent' in ctx).toBe(true);
  });

  it('occurredAt が ISO 8601 形式でペイロードに含まれる', () => {
    const before = Date.now();
    reportClientError('error', 'タイトル', 'メッセージ');
    const after = Date.now();

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    const ts = new Date(body.occurredAt as string).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});
