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

import { login, executeMylistRegistration } from '../../src/playwright-automation';
import { reportErrorEvent } from '@nagiyu/aws';
import type { Page } from 'playwright';

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
    ...overrides,
  } as unknown as Page;
}

describe('playwright-automation', () => {
  beforeEach(() => {
    jest.mocked(reportErrorEvent).mockClear();
  });

  describe('login', () => {
    it('ログイン失敗時に reportErrorEvent を呼ぶ', async () => {
      const mockPage = createMockPage({
        goto: jest.fn().mockRejectedValue(new Error('Navigation timeout')),
      });

      await expect(login(mockPage, 'test@example.com', 'password')).rejects.toThrow();

      expect(jest.mocked(reportErrorEvent)).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceId: 'niconico-mylist-assistant',
          severity: 'error',
          title: 'ニコニコログイン失敗',
          context: expect.objectContaining({ step: 'login' }),
        })
      );
    });
  });

  describe('executeMylistRegistration', () => {
    it('ブラウザ起動失敗時に reportErrorEvent を呼ぶ', async () => {
      mockChromiumLaunch.mockRejectedValue(new Error('Executable does not exist'));

      const result = await executeMylistRegistration(
        'test@example.com',
        'password',
        'test-mylist',
        ['sm1', 'sm2']
      );

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
  });
});
