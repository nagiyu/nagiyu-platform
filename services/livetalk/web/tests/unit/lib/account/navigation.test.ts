import { redirectToSignOut } from '@/lib/account/navigation';

// buildSignOutUrl をモック化して引数を検証できるようにする
const mockBuildSignOutUrl = jest.fn(
  (authUrl: string, callbackUrl?: string) =>
    `${authUrl}/signout?callbackUrl=${encodeURIComponent(callbackUrl ?? '')}`
);
jest.mock('@nagiyu/ui', () => ({
  buildSignOutUrl: (authUrl: string, callbackUrl?: string) =>
    mockBuildSignOutUrl(authUrl, callbackUrl),
}));

// window.location.assign の検証について:
// jsdom では window.location.assign を直接上書きできないため、
// buildSignOutUrl に渡された引数を検証する方式を採用する（LiveTalkHeader.test.tsx と同方式）。
// jsdom は assign 時に「未実装」の console.error を出すため、テスト出力を汚さないよう抑制する。
describe('redirectToSignOut', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    jest.clearAllMocks();
  });

  it('authUrl と公開オリジンを buildSignOutUrl に渡す', () => {
    redirectToSignOut('https://auth.nagiyu.com');

    expect(mockBuildSignOutUrl).toHaveBeenCalledTimes(1);
    expect(mockBuildSignOutUrl).toHaveBeenCalledWith(
      'https://auth.nagiyu.com',
      window.location.origin
    );
  });
});
