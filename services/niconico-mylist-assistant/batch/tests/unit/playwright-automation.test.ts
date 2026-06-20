const mockChromiumLaunch = jest.fn();

jest.mock('@nagiyu/aws', () => ({
  ...jest.requireActual('@nagiyu/aws'),
  reportErrorEvent: jest.fn().mockResolvedValue(null),
  createS3Client: jest.fn().mockReturnValue(null),
  uploadFile: jest.fn().mockResolvedValue(undefined),
  getS3ObjectUrl: jest.fn().mockReturnValue(''),
}));

jest.mock('playwright', () => ({
  chromium: {
    launch: (...args: unknown[]) => mockChromiumLaunch(...args),
  },
}));

import {
  executeMylistRegistration,
  registerOverlayBannerHandler,
  createContextWithSession,
} from '../../src/playwright-automation';
import { reportErrorEvent } from '@nagiyu/aws';
import type { Browser, Page } from 'playwright';

function createMockPage(overrides: Partial<Record<string, jest.Mock>> = {}): Page {
  return {
    goto: jest.fn().mockRejectedValue(new Error('Navigation timeout')),
    fill: jest.fn(),
    getByRole: jest.fn().mockReturnValue({ click: jest.fn() }),
    waitForURL: jest.fn(),
    url: jest.fn().mockReturnValue('https://example.com'),
    screenshot: jest.fn().mockResolvedValue(Buffer.from('')),
    locator: jest.fn().mockReturnValue({ all: jest.fn().mockResolvedValue([]) }),
    on: jest.fn(),
    addLocatorHandler: jest.fn().mockResolvedValue(undefined),
    evaluate: jest.fn().mockResolvedValue(undefined),
    keyboard: {
      press: jest.fn().mockResolvedValue(undefined),
      type: jest.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  } as unknown as Page;
}

function createMockBrowser(overrides: Partial<Record<string, jest.Mock>> = {}): Browser {
  const mockPage = createMockPage();
  const mockContext = {
    addCookies: jest.fn().mockResolvedValue(undefined),
    newPage: jest.fn().mockResolvedValue(mockPage),
    close: jest.fn().mockResolvedValue(undefined),
  };
  return {
    newContext: jest.fn().mockResolvedValue(mockContext),
    close: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as Browser;
}

describe('playwright-automation', () => {
  beforeEach(() => {
    jest.mocked(reportErrorEvent).mockClear();
    mockChromiumLaunch.mockReset();
  });

  describe('registerOverlayBannerHandler', () => {
    it('addLocatorHandler を noWaitAfter: true で登録する', async () => {
      const mockPage = createMockPage();
      await registerOverlayBannerHandler(mockPage);
      expect(jest.mocked(mockPage.addLocatorHandler)).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(Function),
        { noWaitAfter: true }
      );
    });

    it('バナーのボタンが存在する場合はクリックして閉じる', async () => {
      const mockCloseButton = {
        count: jest.fn().mockResolvedValue(1),
        click: jest.fn().mockResolvedValue(undefined),
      };
      const mockLocator = {
        ...mockCloseButton,
        first: jest.fn().mockReturnValue(mockCloseButton),
      };
      const mockPage = createMockPage({
        locator: jest.fn().mockReturnValue(mockLocator),
        addLocatorHandler: jest.fn().mockResolvedValue(undefined),
      });

      await registerOverlayBannerHandler(mockPage);
      const handler = jest.mocked(mockPage.addLocatorHandler).mock.calls[0][1];
      await handler();

      expect(mockCloseButton.click).toHaveBeenCalledWith({ timeout: 3000, force: true });
    });

    it('バナーのボタンが存在しない場合は DOM から除去する', async () => {
      const mockCloseButton = {
        count: jest.fn().mockResolvedValue(0),
        click: jest.fn(),
      };
      const mockLocator = {
        ...mockCloseButton,
        first: jest.fn().mockReturnValue(mockCloseButton),
      };
      const mockEvaluate = jest.fn().mockResolvedValue(undefined);
      const mockPage = createMockPage({
        locator: jest.fn().mockReturnValue(mockLocator),
        addLocatorHandler: jest.fn().mockResolvedValue(undefined),
        evaluate: mockEvaluate,
      });

      await registerOverlayBannerHandler(mockPage);
      const handler = jest.mocked(mockPage.addLocatorHandler).mock.calls[0][1];
      await handler();

      expect(mockEvaluate).toHaveBeenCalled();
      expect(mockCloseButton.click).not.toHaveBeenCalled();
    });

    it('除去処理が失敗しても例外をスローせず処理を継続する', async () => {
      const mockCloseButton = {
        count: jest.fn().mockResolvedValue(1),
        click: jest.fn().mockRejectedValue(new Error('クリック失敗')),
      };
      const mockLocator = {
        ...mockCloseButton,
        first: jest.fn().mockReturnValue(mockCloseButton),
      };
      const mockPage = createMockPage({
        locator: jest.fn().mockReturnValue(mockLocator),
        addLocatorHandler: jest.fn().mockResolvedValue(undefined),
      });

      await registerOverlayBannerHandler(mockPage);
      const handler = jest.mocked(mockPage.addLocatorHandler).mock.calls[0][1];

      await expect(handler()).resolves.toBeUndefined();
    });
  });

  describe('createContextWithSession', () => {
    it('user_session クッキーを正しい属性で注入する', async () => {
      const mockContext = {
        addCookies: jest.fn().mockResolvedValue(undefined),
        newPage: jest.fn().mockResolvedValue(createMockPage()),
        close: jest.fn().mockResolvedValue(undefined),
      };
      const mockBrowser = {
        newContext: jest.fn().mockResolvedValue(mockContext),
        close: jest.fn().mockResolvedValue(undefined),
      } as unknown as Browser;

      await createContextWithSession(mockBrowser, 'test_session_value');

      expect(mockBrowser.newContext).toHaveBeenCalledWith({ locale: 'ja-JP' });
      expect(mockContext.addCookies).toHaveBeenCalledWith([
        expect.objectContaining({
          name: 'user_session',
          value: 'test_session_value',
          domain: '.nicovideo.jp',
          path: '/',
          secure: true,
          sameSite: 'Lax',
        }),
      ]);
    });

    it('コンテキスト作成後にそのコンテキストを返す', async () => {
      const mockContext = {
        addCookies: jest.fn().mockResolvedValue(undefined),
        newPage: jest.fn().mockResolvedValue(createMockPage()),
        close: jest.fn().mockResolvedValue(undefined),
      };
      const mockBrowser = {
        newContext: jest.fn().mockResolvedValue(mockContext),
        close: jest.fn().mockResolvedValue(undefined),
      } as unknown as Browser;

      const result = await createContextWithSession(mockBrowser, 'session_value');
      expect(result).toBe(mockContext);
    });
  });

  describe('executeMylistRegistration', () => {
    it('ブラウザ起動失敗時に reportErrorEvent を呼ぶ', async () => {
      mockChromiumLaunch.mockRejectedValue(new Error('Executable does not exist'));

      const result = await executeMylistRegistration('user_session_value', 'test-mylist', [
        'sm1',
        'sm2',
      ]);

      expect(result.successVideoIds).toHaveLength(0);
      expect(result.failedVideoIds).toEqual(['sm1', 'sm2']);
      expect(jest.mocked(reportErrorEvent)).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceId: 'niconico-mylist-assistant',
          severity: 'error',
          title: 'Playwright 自動化処理失敗',
          context: expect.objectContaining({ step: 'executeMylistRegistration' }),
        })
      );
    });

    it('コンテキスト作成失敗時に reportErrorEvent を呼ぶ', async () => {
      const mockBrowser = createMockBrowser({
        newContext: jest.fn().mockRejectedValue(new Error('コンテキスト作成失敗')),
      });
      mockChromiumLaunch.mockResolvedValue(mockBrowser);

      const result = await executeMylistRegistration('user_session_value', 'test-mylist', [
        'sm1',
        'sm2',
      ]);

      expect(result.successVideoIds).toHaveLength(0);
      expect(result.failedVideoIds).toEqual(['sm1', 'sm2']);
      expect(jest.mocked(reportErrorEvent)).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceId: 'niconico-mylist-assistant',
          severity: 'error',
          title: 'Playwright 自動化処理失敗',
        })
      );
    });

    it('ブラウザとコンテキストを正常にクローズする', async () => {
      const mockContext = {
        addCookies: jest.fn().mockResolvedValue(undefined),
        newPage: jest.fn().mockRejectedValue(new Error('ページ作成失敗')),
        close: jest.fn().mockResolvedValue(undefined),
      };
      const mockBrowser = createMockBrowser({
        newContext: jest.fn().mockResolvedValue(mockContext),
      });
      mockChromiumLaunch.mockResolvedValue(mockBrowser);

      await executeMylistRegistration('user_session_value', 'test-mylist', ['sm1']);

      expect(mockContext.close).toHaveBeenCalled();
      expect(mockBrowser.close).toHaveBeenCalled();
    });
  });
});
