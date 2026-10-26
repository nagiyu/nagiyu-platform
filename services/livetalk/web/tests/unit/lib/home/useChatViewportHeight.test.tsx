import { act, renderHook } from '@testing-library/react';
import {
  CHAT_VIEWPORT_FALLBACK_HEIGHT,
  measureChatViewportHeight,
  useChatViewportHeight,
} from '@/lib/home/useChatViewportHeight';

/** ResizeObserver の差し替え。observe された要素と、コールバックの発火を取れるようにする */
class MockResizeObserver {
  public static instances: MockResizeObserver[] = [];
  public observed: Element[] = [];
  public disconnected = false;
  private readonly callback: () => void;

  constructor(callback: () => void) {
    this.callback = callback;
    MockResizeObserver.instances.push(this);
  }

  public observe(element: Element) {
    this.observed.push(element);
  }

  public disconnect() {
    this.disconnected = true;
  }

  public trigger() {
    this.callback();
  }
}

/** 共通レイアウトと同じく、main の兄弟として header / footer を並べて body に追加する */
function mountHeaderAndFooter(sizes: { header: number; footer: number }) {
  const layout = document.createElement('div');
  const header = document.createElement('header');
  const main = document.createElement('main');
  const footer = document.createElement('footer');
  header.getBoundingClientRect = () => ({ height: sizes.header }) as DOMRect;
  footer.getBoundingClientRect = () => ({ height: sizes.footer }) as DOMRect;
  layout.append(header, main, footer);
  document.body.append(layout);
  return { header, footer };
}

function setInnerHeight(height: number) {
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
}

const originalResizeObserver = globalThis.ResizeObserver;
const originalInnerHeight = window.innerHeight;

beforeEach(() => {
  MockResizeObserver.instances = [];
  globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
});

afterEach(() => {
  document.body.innerHTML = '';
  globalThis.ResizeObserver = originalResizeObserver;
  setInnerHeight(originalInnerHeight);
});

describe('measureChatViewportHeight', () => {
  it('画面の高さからヘッダーとフッターの実寸を引く', () => {
    setInnerHeight(667);
    mountHeaderAndFooter({ header: 56, footer: 80 });

    expect(measureChatViewportHeight()).toBe(531);
  });

  it('小数の端数は切り捨てて、ページが 1px はみ出さないようにする', () => {
    setInnerHeight(667);
    mountHeaderAndFooter({ header: 56.4, footer: 80.2 });

    expect(measureChatViewportHeight()).toBe(530);
  });

  it('ヘッダーとフッターが画面より高いときは 0 にする', () => {
    setInnerHeight(100);
    mountHeaderAndFooter({ header: 56, footer: 80 });

    expect(measureChatViewportHeight()).toBe(0);
  });

  it('ヘッダーが無いときは測れないので null を返す', () => {
    const layout = document.createElement('div');
    layout.append(document.createElement('main'), document.createElement('footer'));
    document.body.append(layout);

    expect(measureChatViewportHeight()).toBeNull();
  });

  it('フッターが無いときは測れないので null を返す', () => {
    const layout = document.createElement('div');
    layout.append(document.createElement('header'), document.createElement('main'));
    document.body.append(layout);

    expect(measureChatViewportHeight()).toBeNull();
  });

  it('main が無いときは測れないので null を返す', () => {
    document.body.append(document.createElement('header'), document.createElement('footer'));

    expect(measureChatViewportHeight()).toBeNull();
  });

  it('レイアウト外の header / footer は拾わず、main の兄弟だけを使う', () => {
    setInnerHeight(667);
    const strayHeader = document.createElement('header');
    const strayFooter = document.createElement('footer');
    strayHeader.getBoundingClientRect = () => ({ height: 999 }) as DOMRect;
    strayFooter.getBoundingClientRect = () => ({ height: 999 }) as DOMRect;
    document.body.append(strayHeader, strayFooter);
    mountHeaderAndFooter({ header: 56, footer: 80 });

    expect(measureChatViewportHeight()).toBe(531);
  });
});

describe('useChatViewportHeight', () => {
  it('ヘッダーとフッターが測れるとき、実寸を引いた高さを px で返す', () => {
    setInnerHeight(568);
    mountHeaderAndFooter({ header: 56, footer: 100 });

    const { result } = renderHook(() => useChatViewportHeight());

    expect(result.current).toBe('412px');
  });

  it('ヘッダー・フッターが測れないあいだはフォールバックの高さを返す', () => {
    const { result } = renderHook(() => useChatViewportHeight());

    expect(result.current).toBe(CHAT_VIEWPORT_FALLBACK_HEIGHT);
  });

  it('画面サイズが変わったら高さを測り直す', () => {
    setInnerHeight(667);
    mountHeaderAndFooter({ header: 56, footer: 80 });
    const { result } = renderHook(() => useChatViewportHeight());
    expect(result.current).toBe('531px');

    act(() => {
      setInnerHeight(568);
      window.dispatchEvent(new Event('resize'));
    });

    expect(result.current).toBe('432px');
  });

  it('フッターの高さが変わったら高さを測り直す', () => {
    setInnerHeight(667);
    const { footer } = mountHeaderAndFooter({ header: 56, footer: 80 });
    const { result } = renderHook(() => useChatViewportHeight());
    expect(result.current).toBe('531px');

    act(() => {
      footer.getBoundingClientRect = () => ({ height: 100 }) as DOMRect;
      MockResizeObserver.instances[0].trigger();
    });

    expect(result.current).toBe('511px');
  });

  it('ヘッダーとフッターの両方を ResizeObserver で監視する', () => {
    const { header, footer } = mountHeaderAndFooter({ header: 56, footer: 80 });

    renderHook(() => useChatViewportHeight());

    expect(MockResizeObserver.instances[0].observed).toEqual([header, footer]);
  });

  it('アンマウントで監視とイベントリスナーを解除する', () => {
    setInnerHeight(667);
    mountHeaderAndFooter({ header: 56, footer: 80 });
    const removeSpy = jest.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useChatViewportHeight());
    unmount();

    expect(MockResizeObserver.instances[0].disconnected).toBe(true);
    expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    removeSpy.mockRestore();
  });

  it('ResizeObserver が無い環境でも、resize で追従する', () => {
    // @ts-expect-error ResizeObserver 非対応のブラウザを再現する
    delete globalThis.ResizeObserver;
    setInnerHeight(667);
    mountHeaderAndFooter({ header: 56, footer: 80 });

    const { result } = renderHook(() => useChatViewportHeight());
    expect(result.current).toBe('531px');

    act(() => {
      setInnerHeight(600);
      window.dispatchEvent(new Event('resize'));
    });

    expect(result.current).toBe('464px');
  });
});
