import '@testing-library/jest-dom';
import React from 'react';
import { render, act } from '@testing-library/react';
import { VideoAd } from '@/app/jobs/[jobId]/VideoAd';

// IMA SDK モックの型定義
type AdsManagerLoadedHandler = (event: { getAdsManager: () => MockAdsManager }) => void;
type AdErrorHandler = () => void;
type AdsManagerEventHandler = () => void;

type MockAdsManager = {
  addEventListener: jest.Mock;
  init: jest.Mock;
  start: jest.Mock;
  destroy: jest.Mock;
};

type MockAdsLoader = {
  addEventListener: jest.Mock;
  requestAds: jest.Mock;
};

type MockAdDisplayContainer = {
  initialize: jest.Mock;
};

type MockIma = {
  AdDisplayContainer: jest.Mock;
  AdsLoader: jest.Mock;
  AdsRequest: jest.Mock;
  AdsManagerLoadedEvent: { Type: { ADS_MANAGER_LOADED: string } };
  AdEvent: { Type: { COMPLETE: string; SKIPPED: string; ALL_ADS_COMPLETED: string } };
  AdErrorEvent: { Type: { AD_ERROR: string } };
  ViewMode: { NORMAL: string };
};

const buildMockIma = (): {
  ima: MockIma;
  mockAdsManager: MockAdsManager;
  mockAdsLoader: MockAdsLoader;
  mockAdDisplayContainer: MockAdDisplayContainer;
  triggerAdsManagerLoaded: (handler: AdsManagerLoadedHandler) => void;
  triggerLoaderAdError: (handler: AdErrorHandler) => void;
} => {
  const mockAdsManager: MockAdsManager = {
    addEventListener: jest.fn(),
    init: jest.fn(),
    start: jest.fn(),
    destroy: jest.fn(),
  };

  const mockAdDisplayContainer: MockAdDisplayContainer = {
    initialize: jest.fn(),
  };

  let adsManagerLoadedHandler: AdsManagerLoadedHandler | null = null;
  let loaderAdErrorHandler: AdErrorHandler | null = null;

  const mockAdsLoader: MockAdsLoader = {
    addEventListener: jest.fn((type: string, handler: AdsManagerLoadedHandler | AdErrorHandler) => {
      if (type === 'adsManagerLoaded') adsManagerLoadedHandler = handler as AdsManagerLoadedHandler;
      if (type === 'adError') loaderAdErrorHandler = handler as AdErrorHandler;
    }),
    requestAds: jest.fn(),
  };

  const ima: MockIma = {
    AdDisplayContainer: jest.fn().mockReturnValue(mockAdDisplayContainer),
    AdsLoader: jest.fn().mockReturnValue(mockAdsLoader),
    AdsRequest: jest.fn().mockImplementation(() => ({
      adTagUrl: '',
      linearAdSlotWidth: 0,
      linearAdSlotHeight: 0,
      nonLinearAdSlotWidth: 0,
      nonLinearAdSlotHeight: 0,
    })),
    AdsManagerLoadedEvent: { Type: { ADS_MANAGER_LOADED: 'adsManagerLoaded' } },
    AdEvent: {
      Type: { COMPLETE: 'complete', SKIPPED: 'skipped', ALL_ADS_COMPLETED: 'allAdsCompleted' },
    },
    AdErrorEvent: { Type: { AD_ERROR: 'adError' } },
    ViewMode: { NORMAL: 'normal' },
  };

  return {
    ima,
    mockAdsManager,
    mockAdsLoader,
    mockAdDisplayContainer,
    triggerAdsManagerLoaded: (handler) => {
      if (adsManagerLoadedHandler) adsManagerLoadedHandler(handler as never);
    },
    triggerLoaderAdError: () => {
      if (loaderAdErrorHandler) loaderAdErrorHandler();
    },
  };
};

describe('VideoAd', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
    delete (window as Window & { google?: { ima: MockIma } }).google;
  });

  it('VAST タグ URL が未設定の場合、即座に onAdFinished を呼ぶ', async () => {
    delete process.env.NEXT_PUBLIC_VAST_TAG_URL;
    const onAdFinished = jest.fn();

    await act(async () => {
      render(<VideoAd onAdFinished={onAdFinished} />);
    });

    expect(onAdFinished).toHaveBeenCalledTimes(1);
  });

  it('VAST タグ URL が空文字の場合、即座に onAdFinished を呼ぶ', async () => {
    process.env.NEXT_PUBLIC_VAST_TAG_URL = '';
    const onAdFinished = jest.fn();

    await act(async () => {
      render(<VideoAd onAdFinished={onAdFinished} />);
    });

    expect(onAdFinished).toHaveBeenCalledTimes(1);
  });

  it('広告コンテナと video 要素を描画する', async () => {
    delete process.env.NEXT_PUBLIC_VAST_TAG_URL;
    const onAdFinished = jest.fn();

    let container: HTMLElement;
    await act(async () => {
      ({ container } = render(<VideoAd onAdFinished={onAdFinished} />));
    });

    const videoEl = container!.querySelector('video');
    expect(videoEl).toBeInTheDocument();
  });

  it('IMA SDK ロードが失敗した場合、onAdFinished を呼ぶ（フォールバック）', async () => {
    process.env.NEXT_PUBLIC_VAST_TAG_URL = 'https://example.com/vast';
    const onAdFinished = jest.fn();

    // スクリプト追加を横取りして onerror を発火
    const origCreateElement = document.createElement.bind(document);
    const mockScript = {
      src: '',
      async: false,
      onload: null as (() => void) | null,
      onerror: null as (() => void) | null,
    };
    jest.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'script') return mockScript as unknown as HTMLElement;
      return origCreateElement(tagName);
    });
    jest.spyOn(document.body, 'appendChild').mockImplementation((node) => {
      if (node === mockScript && mockScript.onerror) {
        Promise.resolve().then(() => mockScript.onerror!());
      }
      return node;
    });

    await act(async () => {
      render(<VideoAd onAdFinished={onAdFinished} />);
      await Promise.resolve();
    });

    expect(onAdFinished).toHaveBeenCalledTimes(1);

    jest.restoreAllMocks();
  });

  it('ローダーレベルの AD_ERROR が発生した場合、onAdFinished を呼ぶ（フォールバック）', async () => {
    process.env.NEXT_PUBLIC_VAST_TAG_URL = 'https://example.com/vast';
    const onAdFinished = jest.fn();

    const { ima, triggerLoaderAdError } = buildMockIma();
    (window as Window & { google?: { ima: MockIma } }).google = { ima };

    await act(async () => {
      render(<VideoAd onAdFinished={onAdFinished} />);
      await Promise.resolve();
    });

    act(() => {
      triggerLoaderAdError();
    });

    expect(onAdFinished).toHaveBeenCalledTimes(1);
  });

  it('ADS_MANAGER_LOADED 後に COMPLETE イベントで onAdFinished を呼ぶ', async () => {
    process.env.NEXT_PUBLIC_VAST_TAG_URL = 'https://example.com/vast';
    const onAdFinished = jest.fn();

    const { ima, mockAdsManager, triggerAdsManagerLoaded } = buildMockIma();
    (window as Window & { google?: { ima: MockIma } }).google = { ima };

    let completeHandler: AdsManagerEventHandler | null = null;
    mockAdsManager.addEventListener.mockImplementation(
      (type: string, handler: AdsManagerEventHandler) => {
        if (type === 'complete') completeHandler = handler;
      }
    );

    await act(async () => {
      render(<VideoAd onAdFinished={onAdFinished} />);
      await Promise.resolve();
    });

    act(() => {
      triggerAdsManagerLoaded({
        getAdsManager: () => mockAdsManager,
      });
    });

    expect(mockAdsManager.init).toHaveBeenCalled();
    expect(mockAdsManager.start).toHaveBeenCalled();

    act(() => {
      if (completeHandler) completeHandler();
    });

    expect(onAdFinished).toHaveBeenCalledTimes(1);
  });

  it('ADS_MANAGER_LOADED 後に ALL_ADS_COMPLETED イベントで onAdFinished を呼ぶ', async () => {
    process.env.NEXT_PUBLIC_VAST_TAG_URL = 'https://example.com/vast';
    const onAdFinished = jest.fn();

    const { ima, mockAdsManager, triggerAdsManagerLoaded } = buildMockIma();
    (window as Window & { google?: { ima: MockIma } }).google = { ima };

    let allAdsCompletedHandler: AdsManagerEventHandler | null = null;
    mockAdsManager.addEventListener.mockImplementation(
      (type: string, handler: AdsManagerEventHandler) => {
        if (type === 'allAdsCompleted') allAdsCompletedHandler = handler;
      }
    );

    await act(async () => {
      render(<VideoAd onAdFinished={onAdFinished} />);
      await Promise.resolve();
    });

    act(() => {
      triggerAdsManagerLoaded({
        getAdsManager: () => mockAdsManager,
      });
    });

    act(() => {
      if (allAdsCompletedHandler) allAdsCompletedHandler();
    });

    expect(onAdFinished).toHaveBeenCalledTimes(1);
  });

  it('ADS_MANAGER_LOADED 後に SKIPPED イベントで onAdFinished を呼ぶ', async () => {
    process.env.NEXT_PUBLIC_VAST_TAG_URL = 'https://example.com/vast';
    const onAdFinished = jest.fn();

    const { ima, mockAdsManager, triggerAdsManagerLoaded } = buildMockIma();
    (window as Window & { google?: { ima: MockIma } }).google = { ima };

    let skippedHandler: AdsManagerEventHandler | null = null;
    mockAdsManager.addEventListener.mockImplementation(
      (type: string, handler: AdsManagerEventHandler) => {
        if (type === 'skipped') skippedHandler = handler;
      }
    );

    await act(async () => {
      render(<VideoAd onAdFinished={onAdFinished} />);
      await Promise.resolve();
    });

    act(() => {
      triggerAdsManagerLoaded({
        getAdsManager: () => mockAdsManager,
      });
    });

    act(() => {
      if (skippedHandler) skippedHandler();
    });

    expect(onAdFinished).toHaveBeenCalledTimes(1);
  });

  it('onAdFinished は二重呼び出しされない（べき等性）', async () => {
    process.env.NEXT_PUBLIC_VAST_TAG_URL = 'https://example.com/vast';
    const onAdFinished = jest.fn();

    const { ima, mockAdsManager, triggerAdsManagerLoaded } = buildMockIma();
    (window as Window & { google?: { ima: MockIma } }).google = { ima };

    const handlers: AdsManagerEventHandler[] = [];
    mockAdsManager.addEventListener.mockImplementation(
      (_type: string, handler: AdsManagerEventHandler) => {
        handlers.push(handler);
      }
    );

    await act(async () => {
      render(<VideoAd onAdFinished={onAdFinished} />);
      await Promise.resolve();
    });

    act(() => {
      triggerAdsManagerLoaded({
        getAdsManager: () => mockAdsManager,
      });
    });

    // 複数のイベントを連続で発火しても onAdFinished は1回だけ呼ばれる
    act(() => {
      handlers.forEach((h) => h());
    });

    expect(onAdFinished).toHaveBeenCalledTimes(1);
  });

  it('アンマウント時に adsManager.destroy が呼ばれる', async () => {
    process.env.NEXT_PUBLIC_VAST_TAG_URL = 'https://example.com/vast';
    const onAdFinished = jest.fn();

    const { ima, mockAdsManager, triggerAdsManagerLoaded } = buildMockIma();
    (window as Window & { google?: { ima: MockIma } }).google = { ima };

    mockAdsManager.addEventListener.mockImplementation(jest.fn());

    let unmount: () => void;
    await act(async () => {
      ({ unmount } = render(<VideoAd onAdFinished={onAdFinished} />));
      await Promise.resolve();
    });

    act(() => {
      triggerAdsManagerLoaded({
        getAdsManager: () => mockAdsManager,
      });
    });

    act(() => {
      unmount!();
    });

    expect(mockAdsManager.destroy).toHaveBeenCalled();
  });

  it('SDK ロード中にアンマウントされた場合、コールバックは実行されない', async () => {
    process.env.NEXT_PUBLIC_VAST_TAG_URL = 'https://example.com/vast';
    const onAdFinished = jest.fn();

    // SDK ロードを制御するためのプロミス
    let resolveIma: ((ima: MockIma) => void) | null = null;
    const sdkPromise = new Promise<MockIma>((resolve) => {
      resolveIma = resolve;
    });

    const { ima, mockAdsManager } = buildMockIma();
    mockAdsManager.addEventListener.mockImplementation(jest.fn());

    // window.google が設定されていない状態でスクリプトロードをシミュレート
    const origCreateElement = document.createElement.bind(document);
    const mockScript = {
      src: '',
      async: false,
      onload: null as (() => void) | null,
      onerror: null as (() => void) | null,
    };
    jest.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'script') return mockScript as unknown as HTMLElement;
      return origCreateElement(tagName);
    });
    jest.spyOn(document.body, 'appendChild').mockImplementation((node) => {
      if (node === mockScript) {
        // SDK の非同期ロードをシミュレート（解決は後で行う）
        sdkPromise.then(() => {
          (window as Window & { google?: { ima: MockIma } }).google = { ima };
          if (mockScript.onload) mockScript.onload();
        });
      }
      return node;
    });

    let unmount: () => void;
    await act(async () => {
      ({ unmount } = render(<VideoAd onAdFinished={onAdFinished} />));
    });

    // アンマウント（active = false にする）
    act(() => {
      unmount!();
    });

    // その後で SDK ロードを完了させる（active = false なので何もしない）
    await act(async () => {
      resolveIma!(ima);
      await Promise.resolve();
      await Promise.resolve();
    });

    // アンマウント後は onAdFinished が呼ばれない
    expect(onAdFinished).not.toHaveBeenCalled();

    jest.restoreAllMocks();
  });
});
