import { renderHook } from '@testing-library/react';
import { useBeforeUnloadWarning } from '../../../src/hooks/useBeforeUnloadWarning';

const dispatchBeforeUnload = () => {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event;
};

describe('useBeforeUnloadWarning', () => {
  it('enabled が true の間は beforeunload を preventDefault する', () => {
    renderHook(() => useBeforeUnloadWarning(true));

    // jsdom の Event は returnValue を真偽値として扱うため、文字列の代入を差し替えて検証する
    const event = new Event('beforeunload', { cancelable: true });
    let assigned: unknown;
    Object.defineProperty(event, 'returnValue', {
      configurable: true,
      get: () => assigned,
      set: (value: unknown) => {
        assigned = value;
      },
    });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(assigned).toBe('');
  });

  it('enabled が false なら何もしない', () => {
    renderHook(() => useBeforeUnloadWarning(false));

    expect(dispatchBeforeUnload().defaultPrevented).toBe(false);
  });

  it('true から false に変わるとリスナーを解除する', () => {
    const { rerender } = renderHook(({ enabled }) => useBeforeUnloadWarning(enabled), {
      initialProps: { enabled: true },
    });
    expect(dispatchBeforeUnload().defaultPrevented).toBe(true);

    rerender({ enabled: false });

    expect(dispatchBeforeUnload().defaultPrevented).toBe(false);
  });

  it('アンマウントでリスナーを解除する', () => {
    const { unmount } = renderHook(() => useBeforeUnloadWarning(true));

    unmount();

    expect(dispatchBeforeUnload().defaultPrevented).toBe(false);
  });
});
