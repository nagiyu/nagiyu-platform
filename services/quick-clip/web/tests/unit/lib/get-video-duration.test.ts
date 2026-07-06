import { getVideoDurationSec } from '@/lib/get-video-duration';

type FakeVideoElement = {
  addEventListener: jest.Mock;
  removeEventListener: jest.Mock;
  duration: number;
  preload: string;
  src: string;
};

describe('getVideoDurationSec', () => {
  const originalCreateElement = document.createElement.bind(document);
  let createElementSpy: jest.SpyInstance;

  beforeEach(() => {
    (URL as unknown as { createObjectURL: jest.Mock }).createObjectURL = jest.fn(
      () => 'blob:mock-url'
    );
    (URL as unknown as { revokeObjectURL: jest.Mock }).revokeObjectURL = jest.fn();
  });

  afterEach(() => {
    createElementSpy?.mockRestore();
    jest.useRealTimers();
  });

  const mockVideoElement = (
    duration: number = Number.NaN
  ): { fakeVideo: FakeVideoElement; listeners: Record<string, () => void> } => {
    const listeners: Record<string, () => void> = {};
    const fakeVideo: FakeVideoElement = {
      addEventListener: jest.fn((event: string, cb: () => void) => {
        listeners[event] = cb;
      }),
      removeEventListener: jest.fn(),
      duration,
      preload: '',
      src: '',
    };

    createElementSpy = jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'video') {
        return fakeVideo as unknown as HTMLVideoElement;
      }
      return originalCreateElement(tag);
    });

    return { fakeVideo, listeners };
  };

  it('loadedmetadataでdurationを取得できる', async () => {
    const { listeners } = mockVideoElement(123.45);
    const file = new File(['dummy'], 'movie.mp4', { type: 'video/mp4' });

    const promise = getVideoDurationSec(file);
    listeners.loadedmetadata();

    await expect(promise).resolves.toBe(123.45);
    expect(URL.createObjectURL).toHaveBeenCalledWith(file);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('errorイベント発生時はundefinedを返す', async () => {
    const { listeners } = mockVideoElement();
    const file = new File(['dummy'], 'movie.mp4', { type: 'video/mp4' });

    const promise = getVideoDurationSec(file);
    listeners.error();

    await expect(promise).resolves.toBeUndefined();
  });

  it('durationがNaNの場合はundefinedを返す', async () => {
    const { listeners } = mockVideoElement(Number.NaN);
    const file = new File(['dummy'], 'movie.mp4', { type: 'video/mp4' });

    const promise = getVideoDurationSec(file);
    listeners.loadedmetadata();

    await expect(promise).resolves.toBeUndefined();
  });

  it('durationがInfinityの場合はundefinedを返す', async () => {
    const { listeners } = mockVideoElement(Number.POSITIVE_INFINITY);
    const file = new File(['dummy'], 'movie.mp4', { type: 'video/mp4' });

    const promise = getVideoDurationSec(file);
    listeners.loadedmetadata();

    await expect(promise).resolves.toBeUndefined();
  });

  it('durationが0以下の場合はundefinedを返す', async () => {
    const { listeners } = mockVideoElement(0);
    const file = new File(['dummy'], 'movie.mp4', { type: 'video/mp4' });

    const promise = getVideoDurationSec(file);
    listeners.loadedmetadata();

    await expect(promise).resolves.toBeUndefined();
  });

  it('タイムアウト時はundefinedを返す', async () => {
    jest.useFakeTimers();
    mockVideoElement(999);
    const file = new File(['dummy'], 'movie.mp4', { type: 'video/mp4' });

    const promise = getVideoDurationSec(file, 1000);
    jest.advanceTimersByTime(1000);

    await expect(promise).resolves.toBeUndefined();
  });

  it('タイムアウト後にloadedmetadataが遅延発火しても解決済みの結果が維持される', async () => {
    jest.useFakeTimers();
    const { listeners } = mockVideoElement(999);
    const file = new File(['dummy'], 'movie.mp4', { type: 'video/mp4' });

    const promise = getVideoDurationSec(file, 1000);
    jest.advanceTimersByTime(1000);
    listeners.loadedmetadata?.();

    await expect(promise).resolves.toBeUndefined();
  });

  it('一度解決した後に再度イベントが発火してもcleanupは1回のみ実行される', async () => {
    const { listeners } = mockVideoElement(123);
    const file = new File(['dummy'], 'movie.mp4', { type: 'video/mp4' });

    const promise = getVideoDurationSec(file);
    listeners.loadedmetadata();
    listeners.loadedmetadata();

    await expect(promise).resolves.toBe(123);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });
});
