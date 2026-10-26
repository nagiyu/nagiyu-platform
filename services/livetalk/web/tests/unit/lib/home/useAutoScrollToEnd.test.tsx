import { act, render } from '@testing-library/react';
import { useAutoScrollToEnd } from '@/lib/home/useAutoScrollToEnd';

function ScrollArea({ items }: { items: string[] }) {
  const ref = useAutoScrollToEnd<HTMLDivElement>();
  return (
    <div ref={ref} data-testid="area">
      {items.map((item) => (
        <p key={item}>{item}</p>
      ))}
    </div>
  );
}

/** jsdom はレイアウトを持たないため、scrollHeight を固定値にして scrollTop の変化を見る */
function stubScrollHeight(element: HTMLElement, height: number) {
  Object.defineProperty(element, 'scrollHeight', { configurable: true, value: height });
}

/** MutationObserver のコールバックは microtask で呼ばれるため、flush してから検証する */
async function flushMutations() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('useAutoScrollToEnd', () => {
  it('中身が追加されたら、末尾までスクロールする', async () => {
    const { getByTestId, rerender } = render(<ScrollArea items={['a']} />);
    const area = getByTestId('area');
    stubScrollHeight(area, 500);

    rerender(<ScrollArea items={['a', 'b']} />);
    await flushMutations();

    expect(area.scrollTop).toBe(500);
  });

  it('テキストが書き換わっても (ストリーミングの追記)、末尾までスクロールする', async () => {
    const { getByTestId } = render(<ScrollArea items={['a']} />);
    const area = getByTestId('area');
    stubScrollHeight(area, 800);

    act(() => {
      area.querySelector('p')!.firstChild!.textContent = 'a が伸びた';
    });
    await flushMutations();

    expect(area.scrollTop).toBe(800);
  });

  it('アンマウント後の変化には反応しない', async () => {
    const { getByTestId, unmount } = render(<ScrollArea items={['a']} />);
    const area = getByTestId('area');
    stubScrollHeight(area, 500);
    unmount();

    area.appendChild(document.createElement('p'));
    await flushMutations();

    expect(area.scrollTop).toBe(0);
  });

  it('ref が要素に付いていなくても例外にならない', () => {
    function Detached() {
      useAutoScrollToEnd<HTMLDivElement>();
      return null;
    }

    expect(() => render(<Detached />)).not.toThrow();
  });
});
