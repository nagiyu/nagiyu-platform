import { useEffect } from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import { SCROLL_END_THRESHOLD, useAutoScrollToEnd } from '@/lib/home/useAutoScrollToEnd';

/** ResizeObserver の差し替え。コールバックを手動で発火できるようにする */
class MockResizeObserver {
  public static instances: MockResizeObserver[] = [];
  public disconnected = false;
  private readonly callback: () => void;

  constructor(callback: () => void) {
    this.callback = callback;
    MockResizeObserver.instances.push(this);
  }

  public observe() {}

  public disconnect() {
    this.disconnected = true;
  }

  public trigger() {
    this.callback();
  }
}

function ScrollArea({ items, onReady }: { items: string[]; onReady?: (fn: () => void) => void }) {
  const { ref, stickToEnd } = useAutoScrollToEnd<HTMLDivElement>();
  useEffect(() => onReady?.(stickToEnd), [onReady, stickToEnd]);
  return (
    <div ref={ref} data-testid="area">
      {items.map((item) => (
        <p key={item}>{item}</p>
      ))}
    </div>
  );
}

/** jsdom はレイアウトを持たないため、寸法を固定値にして scrollTop の変化を見る */
function stubLayout(element: HTMLElement, sizes: { scrollHeight: number; clientHeight: number }) {
  Object.defineProperty(element, 'scrollHeight', { configurable: true, value: sizes.scrollHeight });
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: sizes.clientHeight });
}

/** ユーザーのスクロールを再現する (scrollTop を変えて scroll イベントを起こす) */
function scrollTo(element: HTMLElement, top: number) {
  element.scrollTop = top;
  fireEvent.scroll(element);
}

/** MutationObserver のコールバックは microtask で呼ばれるため、flush してから検証する */
async function flushMutations() {
  await act(async () => {
    await Promise.resolve();
  });
}

const originalResizeObserver = globalThis.ResizeObserver;

beforeEach(() => {
  MockResizeObserver.instances = [];
  globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
});

afterEach(() => {
  globalThis.ResizeObserver = originalResizeObserver;
});

describe('useAutoScrollToEnd', () => {
  it('末尾にいるとき、中身が追加されたら末尾までスクロールする', async () => {
    const { getByTestId, rerender } = render(<ScrollArea items={['a']} />);
    const area = getByTestId('area');
    stubLayout(area, { scrollHeight: 500, clientHeight: 140 });

    rerender(<ScrollArea items={['a', 'b']} />);
    await flushMutations();

    expect(area.scrollTop).toBe(500);
  });

  it('テキストが書き換わっても (ストリーミングの追記)、末尾にいれば追従する', async () => {
    const { getByTestId } = render(<ScrollArea items={['a']} />);
    const area = getByTestId('area');
    stubLayout(area, { scrollHeight: 800, clientHeight: 140 });

    act(() => {
      area.querySelector('p')!.firstChild!.textContent = 'a が伸びた';
    });
    await flushMutations();

    expect(area.scrollTop).toBe(800);
  });

  it('末尾付近 (しきい値以内) にいるあいだは追従する', async () => {
    const { getByTestId, rerender } = render(<ScrollArea items={['a']} />);
    const area = getByTestId('area');
    stubLayout(area, { scrollHeight: 500, clientHeight: 140 });
    // 末尾 (360) から しきい値ちょうど手前
    scrollTo(area, 360 - SCROLL_END_THRESHOLD);

    rerender(<ScrollArea items={['a', 'b']} />);
    await flushMutations();

    expect(area.scrollTop).toBe(500);
  });

  it('上へスクロールして読み返している間は、中身が増えても引き戻さない', async () => {
    const { getByTestId, rerender } = render(<ScrollArea items={['a']} />);
    const area = getByTestId('area');
    stubLayout(area, { scrollHeight: 500, clientHeight: 140 });
    scrollTo(area, 100);

    rerender(<ScrollArea items={['a', 'b']} />);
    await flushMutations();

    expect(area.scrollTop).toBe(100);
  });

  it('読み返したあと末尾付近まで戻ると、追従を再開する', async () => {
    const { getByTestId, rerender } = render(<ScrollArea items={['a']} />);
    const area = getByTestId('area');
    stubLayout(area, { scrollHeight: 500, clientHeight: 140 });
    scrollTo(area, 100);
    scrollTo(area, 360);

    rerender(<ScrollArea items={['a', 'b']} />);
    await flushMutations();

    expect(area.scrollTop).toBe(500);
  });

  it('stickToEnd を呼ぶと、読み返し中でも末尾へ移り、以降の更新にも追従する', async () => {
    let stickToEndFn: () => void = () => {};
    const onReady = (fn: () => void) => {
      stickToEndFn = fn;
    };
    const { getByTestId, rerender } = render(<ScrollArea items={['a']} onReady={onReady} />);
    const area = getByTestId('area');
    stubLayout(area, { scrollHeight: 500, clientHeight: 140 });
    scrollTo(area, 100);

    act(() => stickToEndFn());
    expect(area.scrollTop).toBe(500);

    stubLayout(area, { scrollHeight: 600, clientHeight: 140 });
    rerender(<ScrollArea items={['a', 'b']} onReady={onReady} />);
    await flushMutations();

    expect(area.scrollTop).toBe(600);
  });

  it('領域の高さが変わったとき、末尾にいれば末尾に合わせ直す', () => {
    const { getByTestId } = render(<ScrollArea items={['a']} />);
    const area = getByTestId('area');
    stubLayout(area, { scrollHeight: 500, clientHeight: 140 });
    scrollTo(area, 360);

    // ソフトキーボードで領域が縮み、末尾との距離が広がった状態
    stubLayout(area, { scrollHeight: 500, clientHeight: 80 });
    act(() => MockResizeObserver.instances[0].trigger());

    expect(area.scrollTop).toBe(500);
  });

  it('領域の高さが変わっても、読み返している間は動かさない', () => {
    const { getByTestId } = render(<ScrollArea items={['a']} />);
    const area = getByTestId('area');
    stubLayout(area, { scrollHeight: 500, clientHeight: 140 });
    scrollTo(area, 100);

    stubLayout(area, { scrollHeight: 500, clientHeight: 80 });
    act(() => MockResizeObserver.instances[0].trigger());

    expect(area.scrollTop).toBe(100);
  });

  it('ResizeObserver が無い環境でも、中身の変化には追従する', async () => {
    // @ts-expect-error ResizeObserver 非対応のブラウザを再現する
    delete globalThis.ResizeObserver;
    const { getByTestId, rerender } = render(<ScrollArea items={['a']} />);
    const area = getByTestId('area');
    stubLayout(area, { scrollHeight: 500, clientHeight: 140 });

    rerender(<ScrollArea items={['a', 'b']} />);
    await flushMutations();

    expect(area.scrollTop).toBe(500);
  });

  it('アンマウントで監視を解除し、以降の変化には反応しない', async () => {
    const { getByTestId, unmount } = render(<ScrollArea items={['a']} />);
    const area = getByTestId('area');
    stubLayout(area, { scrollHeight: 500, clientHeight: 140 });
    unmount();

    area.appendChild(document.createElement('p'));
    await flushMutations();

    expect(MockResizeObserver.instances[0].disconnected).toBe(true);
    expect(area.scrollTop).toBe(0);
  });

  it('ref が要素に付いていなくても例外にならない', () => {
    function Detached() {
      const { stickToEnd } = useAutoScrollToEnd<HTMLDivElement>();
      stickToEnd();
      return null;
    }

    expect(() => render(<Detached />)).not.toThrow();
  });
});
